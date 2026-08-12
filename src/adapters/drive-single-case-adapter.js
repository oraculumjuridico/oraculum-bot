"use strict"

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const HASH = /^[a-f0-9]{64}$/
const fail = code => { throw new Error(code) }
const validId = value => ID.test(value || "")
const validDestination = value => value && validId(value.logicalId) && typeof value.name === "string" && value.name.trim() && value.name.length <= 200

function createDriveSingleCaseAdapter({ client, rootFolderId, timeoutMs = 30000 } = {}) {
  if (!client || typeof client.list !== "function" || typeof client.createFolder !== "function" || typeof client.getById !== "function" || typeof client.upload !== "function") fail("DRIVE_CLIENT_MISSING")
  if (!validId(rootFolderId)) fail("DRIVE_ROOT_INVALID")
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) fail("DRIVE_TIMEOUT_INVALID")
  const call = async (operation, write = false) => {
    let timer
    try {
      return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs) })])
    } catch (error) {
      if (/TIMEOUT/i.test(error?.message || "")) fail(write ? "DRIVE_EXTERNAL_EFFECT_UNKNOWN" : "DRIVE_TIMEOUT")
      fail(write ? "DRIVE_EXTERNAL_EFFECT_UNKNOWN" : "DRIVE_EXTERNAL_ERROR")
    } finally { clearTimeout(timer) }
  }
  const list = async query => {
    const result = await call(() => client.list(query))
    if (!Array.isArray(result) || result.some(item => !validId(item?.id))) fail("DRIVE_RESPONSE_INVALID")
    return result.map(item => ({ id: item.id }))
  }
  return Object.freeze({
    findAreaFolders(destination, options = {}) { if (!validDestination(destination) || (options.logicalIdOnly !== undefined && options.logicalIdOnly !== true)) fail("DRIVE_DESTINATION_INVALID"); return list({ kind: "folder", parentId: rootFolderId, logicalId: destination.logicalId, ...(options.logicalIdOnly ? {} : { name: destination.name }) }) },
    async createAreaFolder({ destination, context }) { if (!validDestination(destination) || !context) fail("DRIVE_CREATE_INVALID"); const item = await call(() => client.createFolder({ parentId: rootFolderId, destination, context }), true); if (!validId(item?.id)) fail("DRIVE_EXTERNAL_EFFECT_UNKNOWN"); return { id: item.id } },
    findCaseFolders(parentId, destination, options = {}) { if (!validId(parentId) || !validDestination(destination) || (options.logicalIdOnly !== undefined && options.logicalIdOnly !== true)) fail("DRIVE_DESTINATION_INVALID"); return list({ kind: "folder", parentId, logicalId: destination.logicalId, ...(options.logicalIdOnly ? {} : { name: destination.name }) }) },
    async createCaseFolder({ parentId, destination, context }) { if (!validId(parentId) || !validDestination(destination) || !context) fail("DRIVE_CREATE_INVALID"); const item = await call(() => client.createFolder({ parentId, destination, context }), true); if (!validId(item?.id)) fail("DRIVE_EXTERNAL_EFFECT_UNKNOWN"); return { id: item.id } },
    async verifyFolder(folderId) { if (!validId(folderId)) fail("DRIVE_ID_INVALID"); const item = await call(() => client.getById(folderId)); if (!item) return null; if (!validId(item.id) || !validId(item.parentId) || !validDestination(item) || typeof item.trashed !== "boolean") fail("DRIVE_RESPONSE_INVALID"); return { verified: item.trashed === false, id: item.id, logicalId: item.logicalId, name: item.name, parentId: item.parentId === rootFolderId ? "root" : item.parentId, trashed: item.trashed } },
    findFilesByHash(parentId, hash) { if (!validId(parentId) || !HASH.test(hash || "")) fail("DRIVE_HASH_QUERY_INVALID"); return list({ kind: "file", parentId, sha256: hash }) },
    async upload(payload) { if (!payload || !validId(payload.parentId) || !HASH.test(payload.sha256 || "") || !Number.isInteger(payload.size) || payload.size < 1 || !payload.context || payload.idempotencyKey !== payload.context.idempotencyKey) fail("DRIVE_UPLOAD_INVALID"); const item = await call(() => client.upload(payload), true); if (!validId(item?.id)) fail("DRIVE_EXTERNAL_EFFECT_UNKNOWN"); return { id: item.id } },
    async verifyUpload(fileId, hash) { if (!validId(fileId) || !HASH.test(hash || "")) fail("DRIVE_VERIFY_INVALID"); const item = await call(() => client.getById(fileId)); if (!item) return null; if (!validId(item.id) || !validId(item.parentId) || !HASH.test(item.sha256 || "") || !Number.isInteger(item.size) || typeof item.contentDocumentId !== "string") fail("DRIVE_RESPONSE_INVALID"); return { verified: item.sha256 === hash && item.trashed === false, id: item.id, sha256: item.sha256, size: item.size, parentId: item.parentId, contentDocumentId: item.contentDocumentId } }
  })
}

module.exports = { createDriveSingleCaseAdapter }
