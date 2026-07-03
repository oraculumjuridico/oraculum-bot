const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const MANIFEST_NAME = "storage-snapshot-manifest.json"
const IGNORED_SUFFIXES = [".lock", ".tmp"]

function sha256(file) {
  const hash = crypto.createHash("sha256")
  hash.update(fs.readFileSync(file))
  return hash.digest("hex")
}

function relativeFiles(root) {
  if (!fs.existsSync(root)) return []
  const result = []
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      if (
        entry.isFile() &&
        entry.name !== MANIFEST_NAME &&
        !IGNORED_SUFFIXES.some(suffix => entry.name.endsWith(suffix))
      ) {
        result.push(path.relative(root, absolute).replaceAll("\\", "/"))
      }
    }
  }
  visit(root)
  return result.sort()
}

function validateDataFile(file) {
  const content = fs.readFileSync(file, "utf8")
  if (file.endsWith(".json")) {
    JSON.parse(content)
    return
  }
  if (file.endsWith(".jsonl")) {
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (line.trim()) {
        try {
          JSON.parse(line)
        } catch (error) {
          throw new Error(`${file}:${index + 1}: ${error.message}`)
        }
      }
    }
  }
}

function manifestFor(root) {
  const files = relativeFiles(root).map(relative => {
    const absolute = path.join(root, relative)
    validateDataFile(absolute)
    return {
      path: relative,
      bytes: fs.statSync(absolute).size,
      sha256: sha256(absolute)
    }
  })
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    files
  }
}

function assertExternalDestination(source, destination) {
  const sourcePath = path.resolve(source)
  const destinationPath = path.resolve(destination)
  if (
    destinationPath === sourcePath ||
    destinationPath.startsWith(`${sourcePath}${path.sep}`)
  ) {
    throw new Error("backup destination must be outside the data directory")
  }
}

function createBackup({ source, destination }) {
  const sourcePath = path.resolve(source)
  const destinationRoot = path.resolve(destination)
  assertExternalDestination(sourcePath, destinationRoot)
  if (!fs.existsSync(sourcePath)) throw new Error(`data directory not found: ${sourcePath}`)

  fs.mkdirSync(destinationRoot, { recursive: true })
  const suffix = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`
  const finalPath = path.join(destinationRoot, `snapshot-${suffix}`)
  const temporaryPath = `${finalPath}.tmp`
  fs.mkdirSync(temporaryPath, { recursive: false })

  try {
    const manifest = manifestFor(sourcePath)
    for (const file of manifest.files) {
      const target = path.join(temporaryPath, file.path)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(sourcePath, file.path), target)
    }
    const copiedManifest = manifestFor(temporaryPath)
    copiedManifest.createdAt = manifest.createdAt
    fs.writeFileSync(
      path.join(temporaryPath, MANIFEST_NAME),
      JSON.stringify(copiedManifest, null, 2),
      { encoding: "utf8", mode: 0o600 }
    )
    verifySnapshot(temporaryPath)
    fs.renameSync(temporaryPath, finalPath)
    return finalPath
  } catch (error) {
    fs.rmSync(temporaryPath, { recursive: true, force: true })
    throw error
  }
}

function verifySnapshot(snapshot) {
  const snapshotPath = path.resolve(snapshot)
  const manifestPath = path.join(snapshotPath, MANIFEST_NAME)
  if (!fs.existsSync(manifestPath)) throw new Error("snapshot manifest not found")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error("invalid snapshot manifest")
  }

  const expected = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path))
  const actualPaths = relativeFiles(snapshotPath)
  if (actualPaths.length !== expected.length) throw new Error("snapshot file count mismatch")

  for (const [index, file] of expected.entries()) {
    if (actualPaths[index] !== file.path) throw new Error(`unexpected snapshot file: ${actualPaths[index]}`)
    const absolute = path.join(snapshotPath, file.path)
    validateDataFile(absolute)
    if (fs.statSync(absolute).size !== file.bytes) throw new Error(`size mismatch: ${file.path}`)
    if (sha256(absolute) !== file.sha256) throw new Error(`checksum mismatch: ${file.path}`)
  }
  return manifest
}

function restoreBackup({ snapshot, target, confirmed = false }) {
  if (!confirmed) throw new Error("restore requires --confirm-restore")
  const snapshotPath = path.resolve(snapshot)
  const targetPath = path.resolve(target)
  if (
    targetPath === snapshotPath ||
    targetPath.startsWith(`${snapshotPath}${path.sep}`)
  ) {
    throw new Error("restore target must be outside the snapshot")
  }
  const manifest = verifySnapshot(snapshotPath)
  if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length) {
    throw new Error("restore target must be absent or empty")
  }

  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.restore`
  fs.mkdirSync(temporaryPath, { recursive: false })
  try {
    for (const file of manifest.files) {
      const destination = path.join(temporaryPath, file.path)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(snapshotPath, file.path), destination)
    }
    const restoredManifest = manifestFor(temporaryPath)
    if (JSON.stringify(restoredManifest.files) !== JSON.stringify(manifest.files)) {
      throw new Error("restored data does not match snapshot")
    }
    if (fs.existsSync(targetPath)) fs.rmdirSync(targetPath)
    fs.renameSync(temporaryPath, targetPath)
    return restoredManifest
  } catch (error) {
    fs.rmSync(temporaryPath, { recursive: true, force: true })
    throw error
  }
}

function option(args, name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

function runCli(args = process.argv.slice(2)) {
  const command = args[0]
  if (command === "backup") {
    const source = option(args, "--source", path.join(process.cwd(), "data"))
    const destination = option(args, "--destination", process.env.STORAGE_BACKUP_DIR)
    if (!destination) throw new Error("set STORAGE_BACKUP_DIR or pass --destination")
    console.log(createBackup({ source, destination }))
    return
  }
  if (command === "verify") {
    const snapshot = option(args, "--snapshot")
    if (!snapshot) throw new Error("pass --snapshot")
    console.log(JSON.stringify(verifySnapshot(snapshot)))
    return
  }
  if (command === "restore") {
    const snapshot = option(args, "--snapshot")
    const target = option(args, "--target", path.join(process.cwd(), "data"))
    if (!snapshot) throw new Error("pass --snapshot")
    console.log(JSON.stringify(restoreBackup({
      snapshot,
      target,
      confirmed: args.includes("--confirm-restore")
    })))
    return
  }
  throw new Error("usage: storage-snapshot.js <backup|verify|restore>")
}

if (require.main === module) {
  try {
    runCli()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = {
  MANIFEST_NAME,
  createBackup,
  manifestFor,
  restoreBackup,
  verifySnapshot
}
