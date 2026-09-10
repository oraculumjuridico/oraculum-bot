"use strict"

const assert = require("node:assert/strict")
const {
  CASE_ORIGINALS_FOLDER,
  CASE_ADMIN_FOLDER,
  CASE_AUDIO_FOLDER,
  CASE_ARCHIVE_FOLDER,
  isCaseFolderName,
  isOriginalsFolder,
  isLegacyAudioFolder,
  isLegacyCategoryFolder,
  audioFileName
} = require("../src/domain/drive-case-layout")
const { sameContent, uniqueName, transientDriveError } = require("../scripts/reorganize-drive-case-folders")

assert.equal(CASE_ORIGINALS_FOLDER, "00 - Originais preservados")
assert.equal(CASE_ADMIN_FOLDER, "00_ADMIN")
assert.equal(CASE_AUDIO_FOLDER, "90 - Áudios do atendimento")
assert.equal(CASE_ARCHIVE_FOLDER, "99 - Estrutura anterior")
assert.equal(isCaseFolderName("PRV.260726.809 - Mario Herculano"), true)
assert.equal(isCaseFolderName("CONSULTAS A PARTE"), false)
assert.equal(isOriginalsFolder("00 - Originais recebidos"), true)
assert.equal(isOriginalsFolder("00 - Originais preservados"), true)
assert.equal(isLegacyAudioFolder("Áudios - Audio Geral"), true)
assert.equal(isLegacyAudioFolder(CASE_AUDIO_FOLDER), false)
assert.equal(isLegacyCategoryFolder({ name: "04 - Documentos médicos" }), true)
assert.equal(isLegacyCategoryFolder({ name: "Pasta particular" }), false)
assert.equal(isLegacyCategoryFolder({ name: "Pasta", appProperties: { logicalId: "category:case:abc" } }), true)
assert.equal(
  audioFileName({ clientName: "Maria / Silva", label: "Mensagem Urgente", mimeType: "audio/mpeg", now: "2026-09-09T12:34:56.789Z" }),
  "Áudio - Maria Silva - Mensagem Urgente - 2026-09-09T12-34-56Z.mp3"
)
assert.equal(sameContent({ md5Checksum: "a" }, { md5Checksum: "a" }), true)
assert.equal(sameContent({ size: "10" }, { size: 10 }), true)
assert.equal(uniqueName("RG.pdf", "01 - Documentos pessoais", new Map()), "RG.pdf")
assert.equal(uniqueName("RG.pdf", "01 - Documentos pessoais", new Map([["RG.pdf", {}]])), "Documentos pessoais - RG.pdf")
assert.equal(transientDriveError({ response: { status: 500 } }), true)
assert.equal(transientDriveError({ response: { status: 429 } }), true)
assert.equal(transientDriveError(new Error("Internal Error")), true)
assert.equal(transientDriveError({ response: { status: 400 } }), false)

console.log("drive-case-layout.test.js: ok")
