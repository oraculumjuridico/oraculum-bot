const { google } = require("googleapis")
const fs = require("fs")
const path = require("path")
const os = require("os")
const { Readable } = require("stream")
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

function detalhesErroDrive(e, operation) {
  const data = e?.response?.data || {}
  const error = data.error || e?.code || e?.name || "drive_error"
  const description = data.error_description || data.errorMessage || data.message || e?.message || "Erro Drive"
  const status = e?.response?.status || "sem_status"
  return `${operation} [HTTP ${status}] ${error}: ${description}`
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
  } catch (e) { logErro("drive", detalhesErroDrive(e, "criarPasta")); return null }
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
    logErro("drive", `upload "${nome}": ${detalhesErroDrive(e, "upload")}`)
    return null
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

async function obterOuCriarSubpastaDrive(pastaPaiId, nomePasta) {
  if (!pastaPaiId || !nomePasta) return null
  try {
    const drive = getDrive()
    const existentes = await drive.files.list({
      q: [
        "mimeType = 'application/vnd.google-apps.folder'",
        `name = '${escapeDriveQueryValue(nomePasta)}'`,
        `'${pastaPaiId}' in parents`,
        "trashed = false"
      ].join(" and "),
      fields: "files(id,name,webViewLink)",
      pageSize: 1
    })

    if (existentes.data.files?.length) return existentes.data.files[0]

    const criada = await drive.files.create({
      requestBody: {
        name: nomePasta,
        mimeType: "application/vnd.google-apps.folder",
        parents: [pastaPaiId]
      },
      fields: "id,name,webViewLink"
    })
    logDebug(`[DRIVE] Subpasta criada: ${criada.data.name}`)
    return criada.data
  } catch (e) {
    logErro("drive", detalhesErroDrive(e, "obterOuCriarSubpasta"))
    return null
  }
}

async function buscarArquivoDrivePorNome(pastaId, nomeArquivo) {
  if (!pastaId || !nomeArquivo) return null
  try {
    const existentes = await getDrive().files.list({
      q: [
        `name = '${escapeDriveQueryValue(nomeArquivo)}'`,
        `'${pastaId}' in parents`,
        "trashed = false"
      ].join(" and "),
      fields: "files(id,name,webViewLink,mimeType)",
      pageSize: 1
    })
    return existentes.data.files?.[0] || null
  } catch (e) {
    logErro("drive", detalhesErroDrive(e, "buscarArquivoPorNome"))
    return null
  }
}

async function listarArquivosDriveNaPasta(pastaId) {
  if (!pastaId) return []
  try {
    const drive = getDrive()
    const arquivos = []
    let pageToken
    do {
      const resposta = await drive.files.list({
        q: [`'${escapeDriveQueryValue(pastaId)}' in parents`, "trashed = false", "mimeType != 'application/vnd.google-apps.folder'"].join(" and "),
        fields: "nextPageToken,files(id,name,mimeType,webViewLink,parents,modifiedTime)",
        pageSize: 1000,
        ...(pageToken ? { pageToken } : {})
      })
      arquivos.push(...(resposta.data.files || []))
      pageToken = resposta.data.nextPageToken
    } while (pageToken)
    return arquivos
  } catch (e) {
    logErro("drive", detalhesErroDrive(e, "listarArquivosNaPasta"))
    return []
  }
}

async function baixarArquivoDrive(fileId) {
  if (!fileId) return null
  try {
    const resposta = await getDrive().files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" })
    return resposta?.data == null ? null : Buffer.from(resposta.data)
  } catch (e) {
    logErro("drive", detalhesErroDrive(e, "baixarArquivo"))
    return null
  }
}

async function salvarArquivoBinarioDrive(pastaId, nomeArquivo, buffer, mimeType = "application/octet-stream") {
  if (!pastaId || !nomeArquivo || !Buffer.isBuffer(buffer) || !buffer.length) return null
  try {
    const existente = await buscarArquivoDrivePorNome(pastaId, nomeArquivo)
    const drive = getDrive()
    const media = { mimeType, body: Readable.from([buffer]) }
    const resposta = existente?.id
      ? await drive.files.update({ fileId: existente.id, requestBody: { name: nomeArquivo }, media, fields: "id,name,webViewLink,mimeType" })
      : await drive.files.create({ requestBody: { name: nomeArquivo, parents: [pastaId] }, media, fields: "id,name,webViewLink,mimeType" })
    return { ...resposta.data, mimeType: resposta.data.mimeType || mimeType, folderId: pastaId }
  } catch (e) {
    logErro("drive", detalhesErroDrive(e, "salvarArquivoBinario"))
    return null
  }
}

async function lerJsonDrive(fileId) {
  if (!fileId) return null
  try {
    const res = await getDrive().files.get(
      { fileId, alt: "media" },
      { responseType: "text" }
    )
    if (!res?.data) return null
    return JSON.parse(typeof res.data === "string" ? res.data : String(res.data))
  } catch (e) {
    logErro("drive", detalhesErroDrive(e, "lerJson"))
    return null
  }
}

async function salvarJsonDrive(pastaId, nomeArquivo, dados) {
  if (!pastaId || !nomeArquivo) return null
  const conteudo = JSON.stringify(dados || {}, null, 2)
  const media = {
    mimeType: "application/json",
    body: Readable.from([conteudo])
  }
  try {
    const existente = await buscarArquivoDrivePorNome(pastaId, nomeArquivo)
    const drive = getDrive()
    if (existente?.id) {
      const atualizado = await drive.files.update({
        fileId: existente.id,
        requestBody: { name: nomeArquivo },
        media,
        fields: "id,name,webViewLink"
      })
      logDebug(`[DRIVE] JSON atualizado: ${atualizado.data.name}`)
      return atualizado.data
    }

    const criado = await drive.files.create({
      requestBody: { name: nomeArquivo, parents: [pastaId] },
      media,
      fields: "id,name,webViewLink"
    })
    logDebug(`[DRIVE] JSON criado: ${criado.data.name}`)
    return criado.data
  } catch (e) {
    logErro("drive", detalhesErroDrive(e, "salvarJson"))
    return null
  }
}

async function lerJsonEmSubpastaDrive(pastaPaiId, nomePasta, nomeArquivo) {
  const pasta = await obterOuCriarSubpastaDrive(pastaPaiId, nomePasta)
  if (!pasta?.id) return { pasta: null, arquivo: null, dados: null }
  const arquivo = await buscarArquivoDrivePorNome(pasta.id, nomeArquivo)
  const dados = arquivo?.id ? await lerJsonDrive(arquivo.id) : null
  return { pasta, arquivo, dados }
}

async function salvarJsonEmSubpastaDrive(pastaPaiId, nomePasta, nomeArquivo, dados) {
  const pasta = await obterOuCriarSubpastaDrive(pastaPaiId, nomePasta)
  if (!pasta?.id) return null
  const arquivo = await salvarJsonDrive(pasta.id, nomeArquivo, dados)
  return arquivo ? { ...arquivo, folderId: pasta.id } : null
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
    logErro("drive", detalhesErroDrive(e, "marcarSubstituido"))
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
    logErro("drive", detalhesErroDrive(e, "renomearArquivo"))
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
  } catch (e) { logErro("drive", detalhesErroDrive(e, "uploadAudio")); return null }
}

async function salvarAudioTranscritoNoCaso(u, nomeCliente, buffer, mimeType, status) {
  if (!u?.pastaDriveId || !buffer) return null
  const nomePasta = status === "corrigido" ? "Áudios Transcritos Corrigidos" : "Áudios Transcritos Confirmados"
  return uploadPastaAudio(u.pastaDriveId, nomeCliente || "cliente", nomePasta, buffer, mimeType)
}

module.exports = {
  escapeDriveQueryValue,
  getNomePastaArea,
  detalhesErroDrive,
  obterOuCriarPastaArea,
  criarPastaCliente,
  uploadDrive,
  obterOuCriarSubpastaDrive,
  buscarArquivoDrivePorNome,
  listarArquivosDriveNaPasta,
  baixarArquivoDrive,
  salvarArquivoBinarioDrive,
  lerJsonDrive,
  salvarJsonDrive,
  lerJsonEmSubpastaDrive,
  salvarJsonEmSubpastaDrive,
  marcarArquivoDriveSubstituido,
  renomearArquivoDrive,
  uploadPastaAudio,
  salvarAudioTranscritoNoCaso
}
