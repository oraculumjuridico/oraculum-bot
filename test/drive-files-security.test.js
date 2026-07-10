const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const googleapis = require("googleapis")

const google = googleapis.google
const driveOriginal = google.drive
const oauthOriginal = google.auth.OAuth2

async function consumirStream(stream) {
  if (!stream) return
  for await (const _chunk of stream) {
    // Simula o consumo do upload pela API antes da remoção do arquivo temporário.
  }
}

async function main() {
  const sourcePath = path.join(__dirname, "..", "src", "domain", "drive-files.js")
  const source = fs.readFileSync(sourcePath, "utf8")

  assert.equal(
    /permissions\s*\.\s*create/.test(source),
    false,
    "drive-files não pode criar permissões automaticamente"
  )
  assert.equal(
    /type\s*:\s*["']anyone["']/.test(source),
    false,
    "drive-files não pode conceder acesso a anyone"
  )
  assert.equal(
    /drive\.google\.com\/uc\?export=download/.test(source),
    false,
    "drive-files não pode fabricar URL pública direta"
  )

  const criacoes = []
  let permissoesCriadas = 0

  class OAuth2Fake {
    setCredentials() {}
  }

  google.auth.OAuth2 = OAuth2Fake
  google.drive = () => ({
    files: {
      create: async options => {
        criacoes.push(options)
        await consumirStream(options.media?.body)
        if (options.requestBody.mimeType === "application/vnd.google-apps.folder") {
          return { data: { id: "pasta-audio" } }
        }
        if (options.requestBody.name === "Documento.pdf") {
          return {
            data: {
              id: "arquivo-documento",
              name: "Documento.pdf",
              webViewLink: "https://drive.google.com/file/d/arquivo-documento/view"
            }
          }
        }
        return {
          data: {
            id: "arquivo-audio",
            name: options.requestBody.name,
            webViewLink: "https://drive.google.com/file/d/arquivo-audio/view"
          }
        }
      }
    },
    permissions: {
      create: async () => {
        permissoesCriadas += 1
        throw new Error("permissions.create não deveria ser chamado")
      }
    }
  })

  delete require.cache[require.resolve("../src/domain/drive-files")]
  const {
    uploadDrive,
    uploadPastaAudio
  } = require("../src/domain/drive-files")

  const documento = await uploadDrive(
    "pasta-cliente",
    "Documento.pdf",
    Buffer.from("documento"),
    "application/pdf"
  )

  assert.deepEqual(documento, {
    id: "arquivo-documento",
    name: "Documento.pdf",
    webViewLink: "https://drive.google.com/file/d/arquivo-documento/view"
  })
  assert.deepEqual(criacoes[0].requestBody, {
    name: "Documento.pdf",
    parents: ["pasta-cliente"]
  })

  const audio = await uploadPastaAudio(
    "pasta-cliente",
    "Cliente",
    "Audio Geral",
    Buffer.from("audio"),
    "audio/ogg"
  )

  assert.deepEqual(audio, {
    id: "arquivo-audio",
    name: "Audio - Cliente.ogg",
    webViewLink: "https://drive.google.com/file/d/arquivo-audio/view",
    folderId: "pasta-audio"
  })
  assert.deepEqual(criacoes[1].requestBody, {
    name: "Áudios - Audio Geral",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["pasta-cliente"]
  })
  assert.deepEqual(criacoes[2].requestBody, {
    name: "Audio - Cliente.ogg",
    parents: ["pasta-audio"]
  })
  assert.equal("directDownloadUrl" in audio, false)
  assert.equal(permissoesCriadas, 0)
}

main()
  .then(() => console.log("drive-files-security.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    google.drive = driveOriginal
    google.auth.OAuth2 = oauthOriginal
  })
