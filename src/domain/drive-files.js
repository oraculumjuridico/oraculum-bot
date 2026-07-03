const { google } = require("googleapis")
const fs = require("fs")
const path = require("path")
const os = require("os")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logDebug, logErro } = require("../utils/logging")

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  DRIVE_PASTA_CLIENTES_ID
} = process.env

function getDrive() {
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "urn:ietf:wg:oauth:2.0:oob")
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: "v3", auth: oauth2 })
}

function escapeDriveQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function getNomePastaArea(area, situacao, tipo) {
  if (area === "INSS") return "Previdenciário"
  if (area === "Trabalhista") return "Trabalhista"
  if (situacao === "Consultoria juridica") return "Consulta Jurídica"
  if (situacao === "Revisao de documentos" || tipo === "revisao") return "Revisão de documentos"
  return "Outros"
}

async function obterOuCriarPastaArea(area, situacao, tipo) {
  const drive = getDrive()
  const nomeArea = getNomePastaArea(area, situacao, tipo)
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${escapeDriveQueryValue(nomeArea)}'`,
    `'${DRIVE_PASTA_CLIENTES_ID}' in parents`,
    "trashed = false"
  ].join(" and ")

  const existentes = await drive.files.list({
    q: query,
    fields: "files(id,name,webViewLink)",
    pageSize: 1
  })

  if (existentes.data.files?.length) return existentes.data.files[0]

  const criada = await drive.files.create({
    requestBody: {
      name: nomeArea,
      mimeType: "application/vnd.google-apps.folder",
      parents: [DRIVE_PASTA_CLIENTES_ID]
    },
    fields: "id,name,webViewLink"
  })

  logDebug(`[DRIVE] Pasta da area criada: ${criada.data.name}`)
  return criada.data
}

async function criarPastaCliente(numeroCaso, nome, area, situacao, tipo) {
  try {
    const nomeArea = getNomePastaArea(area, situacao, tipo)
    const pastaArea = await obterOuCriarPastaArea(area, situacao, tipo)
    const pastaAreaId = pastaArea?.id || DRIVE_PASTA_CLIENTES_ID
    const nomePasta = `${numeroCaso} - ${nome}`
    const existentes = await getDrive().files.list({
      q: [
        "mimeType = 'application/vnd.google-apps.folder'",
        `name = '${escapeDriveQueryValue(nomePasta)}'`,
        `'${pastaAreaId}' in parents`,
        "trashed = false"
      ].join(" and "),
      fields: "files(id,name,webViewLink)",
      pageSize: 1
    })
    if (existentes.data.files?.length) {
      logDebug(`[DRIVE] Pasta reutilizada: ${existentes.data.files[0].name}`)
      return existentes.data.files[0]
    }
    const res = await getDrive().files.create({
      requestBody: { name: nomePasta, mimeType: "application/vnd.google-apps.folder", parents: [pastaAreaId] },
      fields: "id,name,webViewLink"
    })
    logDebug(`[DRIVE] Pasta criada: ${res.data.name} (área: ${nomeArea})`)
    return res.data
  } catch (e) { logErro("drive", "criarPasta: " + e.message); return null }
}

async function uploadDrive(pastaId, nome, buffer, mimeType) {
  const seguro  = nome.replace(/[^a-zA-Z0-9._-]/g, "_")
  const tmpPath = path.join(os.tmpdir(), `oraculum_${Date.now()}_${seguro}`)
  try {
    if (!buffer || buffer.length === 0) {
      logErro("drive", `upload "${nome}": buffer vazio`)
      return null
    }
    fs.writeFileSync(tmpPath, buffer)
    const drive = getDrive()
    const res   = await drive.files.create({
      requestBody: { name: nome, parents: [pastaId] },
      media: { mimeType: mimeType || "application/octet-stream", body: fs.createReadStream(tmpPath) },
      fields: "id,name,webViewLink"
    })
    logDebug(`[DRIVE] Upload OK: ${res.data.name} (${res.data.id})`)
    return res.data
  } catch (e) {
    const status  = e.response?.status || "sem_status"
    const detalhe = e.response?.data?.error?.message || e.response?.data?.message || e.message
    logErro("drive", `upload "${nome}" [HTTP ${status}]: ${detalhe}`)
    return null
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

async function marcarArquivoDriveSubstituido(fileId, nomeOriginal = "") {
  if (!fileId) return null
  const nomeBase = sanitizarTextoEntrada(nomeOriginal) || `arquivo-${fileId}`
  const nomeSubstituido = nomeBase.startsWith("[SUBSTITUIDO")
    ? nomeBase
    : `[SUBSTITUIDO - NAO USAR] ${nomeBase}`
  try {
    const res = await getDrive().files.update({
      fileId,
      requestBody: { name: nomeSubstituido },
      fields: "id,name,webViewLink"
    })
    logDebug("[DRIVE] Arquivo marcado como substituido:", res.data.name)
    return res.data
  } catch (e) {
    logErro("drive", "marcarSubstituido: " + e.message)
    return null
  }
}

async function renomearArquivoDrive(fileId, novoNome = "") {
  const nomeFinal = sanitizarTextoEntrada(novoNome)
  if (!fileId || !nomeFinal) return null
  try {
    const res = await getDrive().files.update({
      fileId,
      requestBody: { name: nomeFinal },
      fields: "id,name,webViewLink"
    })
    logDebug("[DRIVE] Arquivo renomeado:", res.data.name)
    return res.data
  } catch (e) {
    logErro("drive", "renomearArquivo: " + e.message)
    return null
  }
}

async function uploadPastaAudio(pastaDriveId, nomeCliente, nomePasta, buffer, mimeType) {
  // Cria subpasta "Áudios - <nomePasta>" dentro da pasta do cliente
  try {
    const drive = getDrive()
    const pasta = await drive.files.create({
      requestBody: { name: `Áudios - ${nomePasta}`, mimeType: "application/vnd.google-apps.folder", parents: [pastaDriveId] },
      fields: "id"
    })
    const ext = mimeType?.includes("ogg") ? ".ogg" : mimeType?.includes("mpeg") ? ".mp3" : ".ogg"
    const nomeArq = `Audio - ${nomeCliente}${ext}`
    const tmp = path.join(os.tmpdir(), `orac_audio_${Date.now()}`)
    fs.writeFileSync(tmp, buffer)
    const res = await drive.files.create({
      requestBody: { name: nomeArq, parents: [pasta.data.id] },
      media: { mimeType: mimeType || "audio/ogg", body: fs.createReadStream(tmp) },
      fields: "id,name,webViewLink"
    })
    try { fs.unlinkSync(tmp) } catch {}
    logDebug(`[DRIVE] Áudio: ${res.data.name}`)
    return { ...res.data, folderId: pasta.data.id }
  } catch (e) { logErro("drive", "uploadAudio: " + e.message); return null }
}

async function salvarAudioTranscritoNoCaso(u, nomeCliente, buffer, mimeType, status) {
  if (!u?.pastaDriveId || !buffer) return null
  const nomePasta = status === "corrigido" ? "Áudios Transcritos Corrigidos" : "Áudios Transcritos Confirmados"
  return uploadPastaAudio(u.pastaDriveId, nomeCliente || "cliente", nomePasta, buffer, mimeType)
}

module.exports = {
  escapeDriveQueryValue,
  getNomePastaArea,
  obterOuCriarPastaArea,
  criarPastaCliente,
  uploadDrive,
  marcarArquivoDriveSubstituido,
  renomearArquivoDrive,
  uploadPastaAudio,
  salvarAudioTranscritoNoCaso
}
