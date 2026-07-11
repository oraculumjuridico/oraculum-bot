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
  const atualizacoes = []
  const listagens = []
  const operacoes = []
  const streamsConsumidos = []
  let permissoesCriadas = 0

  class OAuth2Fake {
    setCredentials() {}
  }

  google.auth.OAuth2 = OAuth2Fake
  google.drive = () => ({
    files: {
      list: async options => {
        listagens.push(options)
        operacoes.push({ tipo: "list", q: options.q })
        if (options.q.includes("Novo-Consolidado.pdf")) return { data: { files: [] } }
        if (options.q.includes("Consolidado.pdf")) return { data: { files: [{ id: "pdf-existente", name: "Consolidado.pdf", mimeType: "application/pdf" }] } }
        if (options.pageToken === "pagina-2") return { data: { files: [{ id: "arquivo-2", name: "B.png", mimeType: "image/png", parents: ["pasta-cliente"] }] } }
        return { data: { files: [{ id: "arquivo-1", name: "A.png", mimeType: "image/png", parents: ["pasta-cliente"] }], nextPageToken: "pagina-2" } }
      },
      get: async options => options.fileId === "falha" ? Promise.reject(new Error("falha ficticia")) : { data: Buffer.from("binario-ficticio") },
      update: async options => {
        atualizacoes.push(options)
        await consumirStream(options.media?.body)
        return { data: { id: options.fileId, name: options.requestBody.name, webViewLink: `fixture://${options.fileId}`, mimeType: options.media.mimeType } }
      },
      create: async options => {
        criacoes.push(options)
        operacoes.push({ tipo: "create", nome: options.requestBody.name })
        await consumirStream(options.media?.body)
        if (options.media?.body) streamsConsumidos.push(options.requestBody.name)
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
        if (options.requestBody.name === "Novo-Consolidado.pdf") {
          return { data: { id: "pdf-novo", name: "Novo-Consolidado.pdf", webViewLink: "fixture://pdf-novo", mimeType: "application/pdf" } }
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
    uploadPastaAudio,
    listarArquivosDriveNaPasta,
    baixarArquivoDrive,
    salvarArquivoBinarioDrive
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

  const listados = await listarArquivosDriveNaPasta("pasta-cliente")
  assert.deepEqual(listados.map(item => item.id), ["arquivo-1", "arquivo-2"])
  assert.match(listagens.at(-2).q, /trashed = false/)
  assert.match(listagens.at(-2).q, /mimeType != 'application\/vnd\.google-apps\.folder'/)
  assert.ok(Buffer.isBuffer(await baixarArquivoDrive("arquivo-1")))
  assert.equal(await baixarArquivoDrive("falha"), null)

  const atualizado = await salvarArquivoBinarioDrive("pasta-cliente", "Consolidado.pdf", Buffer.from("pdf-ficticio"), "application/pdf")
  assert.equal(atualizado.id, "pdf-existente")
  assert.equal(atualizado.folderId, "pasta-cliente")
  assert.equal(atualizacoes[0].fileId, "pdf-existente")
  assert.equal(criacoes.some(item => item.requestBody?.name === "Consolidado.pdf"), false)
  assert.equal(permissoesCriadas, 0)

  const atualizacoesAntesNovo = atualizacoes.length
  const novo = await salvarArquivoBinarioDrive("pasta-cliente", "Novo-Consolidado.pdf", Buffer.from("pdf-novo-ficticio"), "application/pdf")
  const criacaoNovo = criacoes.find(item => item.requestBody?.name === "Novo-Consolidado.pdf")
  const indiceBuscaNovo = operacoes.findIndex(item => item.tipo === "list" && item.q.includes("Novo-Consolidado.pdf"))
  const indiceCriacaoNovo = operacoes.findIndex(item => item.tipo === "create" && item.nome === "Novo-Consolidado.pdf")
  assert.ok(indiceBuscaNovo >= 0 && indiceBuscaNovo < indiceCriacaoNovo)
  assert.ok(criacaoNovo)
  assert.deepEqual(criacaoNovo.requestBody, { name: "Novo-Consolidado.pdf", parents: ["pasta-cliente"] })
  assert.equal(criacaoNovo.media.mimeType, "application/pdf")
  assert.ok(streamsConsumidos.includes("Novo-Consolidado.pdf"))
  assert.equal(novo.id, "pdf-novo")
  assert.equal(novo.folderId, "pasta-cliente")
  assert.equal(atualizacoes.length, atualizacoesAntesNovo, "originais nao podem ser atualizados")
  assert.equal(operacoes.some(item => item.tipo === "delete"), false)
  assert.equal(permissoesCriadas, 0)
  assert.equal("directDownloadUrl" in novo, false)
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
