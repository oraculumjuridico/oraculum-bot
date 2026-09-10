#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const dotenv = require("dotenv")
const { google } = require("googleapis")
const {
  CASE_ORIGINALS_FOLDER,
  CASE_ADMIN_FOLDER,
  CASE_AUDIO_FOLDER,
  CASE_ARCHIVE_FOLDER,
  isCaseFolderName,
  isOriginalsFolder,
  isLegacyAudioFolder,
  isLegacyCategoryFolder,
  safeFilePart
} = require("../src/domain/drive-case-layout")

const APPLY_CONFIRMATION = "REORGANIZE_DRIVE_CASE_FOLDERS_WITHOUT_DELETING"
const FOLDER_MIME = "application/vnd.google-apps.folder"
const apply = process.argv.includes("--apply")
const confirmation = process.argv.find(value => value.startsWith("--confirm="))?.slice(10)
const caseFilter = process.argv.find(value => value.startsWith("--case="))?.slice(7) || null
const envFileArg = process.argv.find(value => value.startsWith("--env-file="))?.slice(11)

function escapeQuery(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function readEnvironment() {
  const envPath = path.resolve(envFileArg || "oraculum-bot.env")
  if (!fs.existsSync(envPath)) throw new Error("ORACULUM_OPERATIONAL_ENV_UNAVAILABLE")
  return { ...process.env, ...dotenv.parse(fs.readFileSync(envPath, "utf8")) }
}

function sameContent(a = {}, b = {}) {
  if (a.md5Checksum && b.md5Checksum) return a.md5Checksum === b.md5Checksum
  return a.size != null && b.size != null && String(a.size) === String(b.size)
}

function uniqueName(name, folderName, occupied) {
  if (!occupied.has(name)) return name
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  const prefix = safeFilePart(folderName).replace(/^\d+\s*-\s*/, "")
  let candidate = `${prefix} - ${base}${ext}`
  let suffix = 2
  while (occupied.has(candidate)) candidate = `${prefix} - ${base} (${suffix++})${ext}`
  return candidate
}

function transientDriveError(error) {
  const status = Number(error?.response?.status || error?.code || 0)
  const message = String(error?.message || "")
  return status === 429 || status >= 500 || /internal error|backend error|rate limit|timeout|econnreset/i.test(message)
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withDriveRetry(operation, attempts = 5) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!transientDriveError(error) || attempt === attempts) throw error
      await wait(500 * (2 ** (attempt - 1)))
    }
  }
  throw lastError
}

async function main() {
  if (apply && confirmation !== APPLY_CONFIRMATION) throw new Error("LIVE_CONFIRMATION_REQUIRED")
  const env = readEnvironment()
  const rootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID || env.DRIVE_PASTA_CLIENTES_ID
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET
  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN
  if (![rootFolderId, clientId, clientSecret, refreshToken].every(Boolean)) throw new Error("DRIVE_ENV_MISSING")

  const oauth = new google.auth.OAuth2(clientId, clientSecret)
  oauth.setCredentials({ refresh_token: refreshToken })
  const drive = google.drive({ version: "v3", auth: oauth })
  const fields = "nextPageToken,files(id,name,mimeType,parents,size,md5Checksum,appProperties,trashed)"
  const metrics = {
    mode: apply ? "apply" : "dry-run",
    casesFound: 0,
    casesChanged: 0,
    filesMovedToRoot: 0,
    audioFilesMoved: 0,
    foldersArchived: 0,
    originalsRenamed: 0,
    originalsMerged: 0,
    duplicateFilesPreserved: 0,
    nestedItemsPreserved: 0,
    verificationErrors: 0
  }
  const planned = []
  const appliedMoves = []

  async function list(q) {
    const items = []
    let pageToken
    do {
      const response = await withDriveRetry(() => drive.files.list({ q, fields, pageSize: 1000, ...(pageToken ? { pageToken } : {}) }))
      items.push(...(response.data.files || []))
      pageToken = response.data.nextPageToken
    } while (pageToken)
    return items
  }

  async function children(parentId) {
    return list(`'${escapeQuery(parentId)}' in parents and trashed=false`)
  }

  async function ensureFolder(parentId, name, logicalId) {
    const found = await list([
      `'${escapeQuery(parentId)}' in parents`,
      "trashed=false",
      `mimeType='${FOLDER_MIME}'`,
      `name='${escapeQuery(name)}'`
    ].join(" and "))
    if (found.length > 1) throw new Error(`DUPLICATE_TARGET_FOLDER:${name}`)
    if (found[0]) return found[0]
    planned.push({ type: "create-folder", parentId, name })
    if (!apply) return { id: `dry:${parentId}:${name}`, name, mimeType: FOLDER_MIME, parents: [parentId], virtual: true }
    const response = await withDriveRetry(() => drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: { logicalId } },
      fields: "id,name,mimeType,parents,appProperties"
    }))
    return response.data
  }

  async function updateParent(item, sourceParentId, targetParentId, newName = null) {
    planned.push({ type: "move", fileId: item.id, sourceParentId, targetParentId, newName })
    if (!apply) return
    await withDriveRetry(() => drive.files.update({
      fileId: item.id,
      addParents: targetParentId,
      removeParents: sourceParentId,
      ...(newName && newName !== item.name ? { requestBody: { name: newName } } : {}),
      fields: "id,name,parents"
    }))
    appliedMoves.push({ fileId: item.id, sourceParentId, targetParentId })
  }

  const rootChildren = await children(rootFolderId)
  const areaFolders = rootChildren.filter(item => item.mimeType === FOLDER_MIME && !isCaseFolderName(item.name))
  const cases = rootChildren.filter(item => item.mimeType === FOLDER_MIME && isCaseFolderName(item.name))
  for (const area of areaFolders) {
    const areaChildren = await children(area.id)
    cases.push(...areaChildren.filter(item => item.mimeType === FOLDER_MIME && isCaseFolderName(item.name)))
  }
  const uniqueCases = [...new Map(cases.map(item => [item.id, item])).values()]
    .filter(item => !caseFilter || item.name.startsWith(caseFilter))
  metrics.casesFound = uniqueCases.length

  for (const caseFolder of uniqueCases) {
    const beforePlanned = planned.length
    const items = await children(caseFolder.id)
    const rootFiles = items.filter(item => item.mimeType !== FOLDER_MIME)
    const folders = items.filter(item => item.mimeType === FOLDER_MIME)
    const occupied = new Map(rootFiles.map(item => [item.name, item]))
    let archiveFolder = folders.find(item => item.name === CASE_ARCHIVE_FOLDER) || null
    let audioFolder = folders.find(item => item.name === CASE_AUDIO_FOLDER) || null
    const originalFolders = folders.filter(item => isOriginalsFolder(item.name))
    let originals = originalFolders.find(item => item.name === CASE_ORIGINALS_FOLDER) || originalFolders[0] || null

    if (originals && originals.name !== CASE_ORIGINALS_FOLDER) {
      planned.push({ type: "rename-folder", fileId: originals.id, name: CASE_ORIGINALS_FOLDER })
      if (apply) await withDriveRetry(() => drive.files.update({ fileId: originals.id, requestBody: { name: CASE_ORIGINALS_FOLDER }, fields: "id,name,parents" }))
      originals = { ...originals, name: CASE_ORIGINALS_FOLDER }
      metrics.originalsRenamed++
    }

    const extraOriginals = originalFolders.filter(item => item.id !== originals?.id)
    if (extraOriginals.length && !originals) originals = await ensureFolder(caseFolder.id, CASE_ORIGINALS_FOLDER, "oraculum:originals")
    for (const extra of extraOriginals) {
      const contents = await children(extra.id)
      const destinationContents = originals?.virtual ? [] : await children(originals.id)
      const destinationNames = new Set(destinationContents.map(item => item.name))
      for (const child of contents) {
        if (child.mimeType === FOLDER_MIME || destinationNames.has(child.name)) {
          metrics.nestedItemsPreserved++
          continue
        }
        await updateParent(child, extra.id, originals.id)
        destinationNames.add(child.name)
        metrics.originalsMerged++
      }
      archiveFolder = archiveFolder || await ensureFolder(caseFolder.id, CASE_ARCHIVE_FOLDER, "oraculum:legacy-structure")
      await archiveFolderSafe(caseFolder, archiveFolder, extra)
    }

    const categoryFolders = folders.filter(item => isLegacyCategoryFolder(item))
    for (const category of categoryFolders) {
      const contents = await children(category.id)
      for (const child of contents) {
        if (child.mimeType === FOLDER_MIME) {
          metrics.nestedItemsPreserved++
          continue
        }
        const conflict = occupied.get(child.name)
        if (conflict && sameContent(conflict, child)) {
          metrics.duplicateFilesPreserved++
          continue
        }
        const targetName = uniqueName(child.name, category.name, occupied)
        await updateParent(child, category.id, caseFolder.id, targetName)
        occupied.set(targetName, { ...child, name: targetName })
        metrics.filesMovedToRoot++
      }
      archiveFolder = archiveFolder || await ensureFolder(caseFolder.id, CASE_ARCHIVE_FOLDER, "oraculum:legacy-structure")
      await archiveFolderSafe(caseFolder, archiveFolder, category)
    }

    const legacyAudioFolders = folders.filter(item => isLegacyAudioFolder(item.name))
    if (legacyAudioFolders.length) audioFolder = audioFolder || await ensureFolder(caseFolder.id, CASE_AUDIO_FOLDER, "oraculum:audio")
    for (const legacyAudio of legacyAudioFolders) {
      const contents = await children(legacyAudio.id)
      const audioContents = audioFolder?.virtual ? [] : await children(audioFolder.id)
      const audioNames = new Set(audioContents.map(item => item.name))
      for (const child of contents) {
        if (child.mimeType === FOLDER_MIME) {
          metrics.nestedItemsPreserved++
          continue
        }
        const targetName = uniqueName(child.name, legacyAudio.name, audioNames)
        await updateParent(child, legacyAudio.id, audioFolder.id, targetName)
        audioNames.add(targetName)
        metrics.audioFilesMoved++
      }
      archiveFolder = archiveFolder || await ensureFolder(caseFolder.id, CASE_ARCHIVE_FOLDER, "oraculum:legacy-structure")
      await archiveFolderSafe(caseFolder, archiveFolder, legacyAudio)
    }

    if (planned.length > beforePlanned) metrics.casesChanged++

    async function archiveFolderSafe(sourceCase, archive, folder) {
      if (folder.id === archive.id || folder.name === CASE_ADMIN_FOLDER || folder.name === CASE_AUDIO_FOLDER) return
      await archiveFolderAction(sourceCase, archive, folder)
    }
  }

  async function archiveFolderAction(caseFolder, archiveFolder, folder) {
    await updateParent(folder, caseFolder.id, archiveFolder.id)
    metrics.foldersArchived++
  }

  if (apply) {
    for (const operation of appliedMoves) {
      const response = await withDriveRetry(() => drive.files.get({ fileId: operation.fileId, fields: "id,parents,trashed" }))
      const parents = response.data.parents || []
      if (response.data.trashed || !parents.includes(operation.targetParentId) || parents.includes(operation.sourceParentId)) {
        metrics.verificationErrors++
      }
    }
  }

  console.log(JSON.stringify({
    ok: metrics.verificationErrors === 0,
    ...metrics,
    plannedOperations: planned.length,
    protectedFolders: [CASE_ADMIN_FOLDER, CASE_ORIGINALS_FOLDER, CASE_AUDIO_FOLDER],
    deletionCount: 0
  }))
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: String(error.message || error).replace(/[^\wÀ-ÿ:.-]/g, "_") }))
    process.exitCode = 1
  })
}

module.exports = { APPLY_CONFIRMATION, sameContent, uniqueName, transientDriveError, withDriveRetry }
