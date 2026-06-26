const {
  normalizarChaveDoc,
  chaveDocumentosCaso,
  getDocumentosListaCaso,
  calcularStatusDocumentos,
  getDocsFaltantesReenviaveis
} = require("./documents-core")
const { primeiroNomeCliente } = require("./phone-name")
const { sanitizarTextoEntrada } = require("../utils/text")

const IMAGEM_DOCS_FINAL_URL = process.env.IMAGEM_DOCS_FINAL_URL || "https://i.imgur.com/LRvw2m8.png"
const IMAGEM_DOCS_PENDENTES_URL = "https://i.imgur.com/mKmFGHO.png"

const IMAGENS_DOCS = {
  aposentadoria:  process.env.IMAGEM_DOC_APOSENTADORIA_URL || "",
  bpc:            process.env.IMAGEM_DOC_BPC_URL || "",
  incapacidade:   process.env.IMAGEM_DOC_INCAPACIDADE_URL || "",
  negado:         process.env.IMAGEM_DOC_NEGADO_URL || "",
  cortado:        process.env.IMAGEM_DOC_SUSPENSO_URL || "",
  dependentes:    process.env.IMAGEM_DOC_PENSAO_MORTE_URL || "",
  demissao:       process.env.IMAGEM_DOC_RESCISAO_URL || "",
  direitos:       process.env.IMAGEM_DOC_DIREITOS_URL || "",
  acidente:       process.env.IMAGEM_DOC_ACIDENTE_URL || "",
  assedio:        process.env.IMAGEM_DOC_ASSEDIO_URL || "",
  divorcio:       process.env.IMAGEM_DOC_DIVORCIO_URL || "",
  familia:        process.env.IMAGEM_DOC_DIVORCIO_URL || "",
  pensao:         process.env.IMAGEM_DOC_PENSAO_ALIM_URL || "",
  guarda:         process.env.IMAGEM_DOC_GUARDA_URL || "",
  inventario:     process.env.IMAGEM_DOC_INVENTARIO_URL || "",
  cobranca:       process.env.IMAGEM_DOC_COBRANCA_URL || "",
  produto:        process.env.IMAGEM_DOC_PRODUTO_URL || "",
  banco:          process.env.IMAGEM_DOC_BANCO_URL || "",
  consumidor:     process.env.IMAGEM_DOC_PRODUTO_URL || "",
  vitima:         process.env.IMAGEM_DOC_VITIMA_URL || "",
  acusado:        process.env.IMAGEM_DOC_DEFESA_CRIMINAL_URL || "",
  penal:          process.env.IMAGEM_DOC_DEFESA_CRIMINAL_URL || "",
  contrato_civil: process.env.IMAGEM_DOC_CIVIL_URL || "",
  indenizacao:    process.env.IMAGEM_DOC_CIVIL_URL || "",
  divida:         process.env.IMAGEM_DOC_CIVIL_URL || "",
  civil:          process.env.IMAGEM_DOC_CIVIL_URL || "",
  imovel_compra:  process.env.IMAGEM_DOC_IMOVEL_URL || "",
  aluguel:        process.env.IMAGEM_DOC_IMOVEL_URL || "",
  usucapiao:      process.env.IMAGEM_DOC_IMOVEL_URL || "",
  imovel:         process.env.IMAGEM_DOC_IMOVEL_URL || "",
  outros:         process.env.IMAGEM_GUIA_DOCS_URL || ""
}

function limparTextoAudioDoc(texto = "") {
  return String(texto || "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function imagemPorAreaTipo(area, tipo, situacao, detalhe = null) {
  const chave = normalizarChaveDoc(area, tipo, situacao, detalhe)
  return IMAGENS_DOCS[chave] || ""
}

function imagemPorCaso(u = {}) {
  const chave = chaveDocumentosCaso(u)
  return IMAGENS_DOCS[chave] || ""
}

function fraseEnvioDocumentoAudio(doc = {}, folha = "", fIdx = 0, totalF = 1) {
  const label = sanitizarTextoEntrada(doc.label || "documento")
  const item = sanitizarTextoEntrada(folha).toLowerCase()
  const artigo = /^[aeiouáéíóúâêôãõ]/i.test(label) ? "da" : "do"
  const nomeDoc = `${artigo} ${label}`

  if (/^foto do documento$|^foto$|^foto do/.test(item)) return `Agora envie uma foto ${nomeDoc}.`
  if (/^frente$/.test(item)) return `Agora envie a frente ${nomeDoc}.`
  if (/^verso$/.test(item)) return `Agora envie o verso ${nomeDoc}.`
  if (/todas as p[aá]ginas/.test(item)) return `Agora envie todas as páginas ${nomeDoc}.`
  if (/cada p[aá]gina/.test(item)) return `Agora envie cada página ${nomeDoc}, uma por vez.`
  if (/cada .*separad/.test(item)) return `Agora envie ${folha.toLowerCase()} ${nomeDoc}.`
  if (/mensagem de texto/.test(item)) return `Agora envie essas informações por mensagem de texto.`

  return totalF > 1
    ? `Agora envie ${folha}, parte ${fIdx + 1} de ${totalF}, ${nomeDoc}.`
    : `Agora envie ${folha} ${nomeDoc}.`
}

function textoAudioTelaDocumentoCaso(u) {
  const statusDocs = calcularStatusDocumentos(u)
  const pendentes = statusDocs.pendentesFluxo
  if (!pendentes.length) {
    return statusDocs.faltantesCriticos.length
      ? "Recebemos os documentos enviados e registramos os itens que ficaram faltando. Na tela, você pode enviar documentos novamente, falar com advogado ou voltar ao menu do cliente."
      : "Muito bem, todos os documentos previstos para este caso foram recebidos. Na tela, você pode enviar documentos novamente, falar com advogado ou voltar ao menu do cliente."
  }

  const doc = pendentes[0]
  const folhas = doc.folhas || ["Foto do documento"]
  const fIdx = u.docAtualIdx || 0
  const folha = folhas[fIdx] || `Foto ${fIdx + 1}`
  const totalF = folhas.length
  const lista = getDocumentosListaCaso(u)
  const total = lista.length
  const progresso = total > 0 ? `Você já enviou ${statusDocs.recebidos.length} de ${total} documentos.` : ""
  const bloco = doc.grupo ? `Estamos no bloco ${doc.grupo}.` : ""
  const parteFoto = fraseEnvioDocumentoAudio(doc, folha, fIdx, totalF)
  const aceita = doc.aceita ? `Pode enviar como ${doc.aceita}.` : "Pode enviar como foto ou PDF."
  const opcional = doc.obrigatorio === false ? "Esse documento é opcional; se você não tiver, pode pular ou enviar depois." : ""
  const dica = doc.audio || (doc.dica ? `Dica: ${limparTextoAudioDoc(doc.dica)}` : "")

  if (doc.id === "doc_rg") {
    return `${progresso} ${bloco} ${parteFoto} ${aceita} ${dica} Se frente e verso já estiverem na mesma imagem, você poderá confirmar isso depois do envio. Também pode escolher não enviar este documento agora, continuar depois ou voltar ao menu do cliente.`
  }

  if (doc.id === "doc_cpf") {
    return `${progresso} ${bloco} ${parteFoto} ${aceita} ${dica} Se o CPF já aparece no RG ou CNH, você pode informar isso na tela. Também pode continuar depois ou voltar ao menu do cliente.`
  }

  return `${progresso} ${bloco} ${parteFoto} ${aceita} ${opcional} ${dica} Na tela, você também pode escolher não enviar este documento agora, continuar depois ou voltar ao menu do cliente.`
}

function telaDocsPendentesComImagem(u) {
  const faltantes = getDocsFaltantesReenviaveis(u)
  const primeiroNome = primeiroNomeCliente(u) || "voce"
  const labelStatus = {
    "nao enviado": "ainda não enviado",
    "informado como ausente": "informado como não disponível",
    "recebido parcialmente": "enviado incompleto"
  }
  const lista = faltantes.map(item => `• ${item.doc.label} _(${labelStatus[item.status] || item.status})_`).join("\n")
  return {
    texto: `📎 *Documentos pendentes*\n\n${primeiroNome}, alguns documentos deste caso ficaram faltando ou incompletos.\n\n⚠️ *Ainda precisamos de:*\n${lista}\n\n📲 Quer enviar esses documentos agora?`,
    imagemUrl: IMAGEM_DOCS_PENDENTES_URL,
    opcoes: [
      { id: "docs_enviar_faltantes", title: "📎 Enviar faltantes" },
      { id: "docs_ver_status", title: "📊 Ver status" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

function montarStatusDocumentosVisual(u, { docEmAndamentoId = null, docConcluidoId = null } = {}) {
  const statusDocs = calcularStatusDocumentos(u)
  const lista = getDocumentosListaCaso(u)
  const total = lista.length
  const statusPorId = new Map()
  for (const d of statusDocs.recebidos) statusPorId.set(d.id, "🟢")
  for (const d of statusDocs.dispensados) statusPorId.set(d.id, "⚪")
  for (const d of [...statusDocs.pulados, ...statusDocs.ausentes, ...statusDocs.parciais]) statusPorId.set(d.id, "🟡")
  if (docEmAndamentoId && !statusPorId.has(docEmAndamentoId)) statusPorId.set(docEmAndamentoId, "🟡")
  if (docConcluidoId) statusPorId.set(docConcluidoId, "🟢")

  const barras = lista.map(d => statusPorId.get(d.id) || "🔴").join("")
  const emAndamento = lista.filter(d => statusPorId.get(d.id) === "🟡").length
  return {
    texto: `${barras}\n${statusDocs.recebidos.length}/${total} completos${emAndamento ? ` · ${emAndamento} em andamento` : ""}`,
    legenda: "🟢 completo · 🟡 em andamento\n⚪ dispensado · 🔴 a enviar",
    statusDocs,
    lista,
    total
  }
}

function telaConcluido(u) {
  u._docsClienteGuiado = false
  const primeiroNome = primeiroNomeCliente(u) || "você"
  const statusDocs = calcularStatusDocumentos(u)
  const recebidos = statusDocs.recebidos.map(d => `- ${d.label}`)
  const faltantes = [
    ...statusDocs.pulados.map(d => `- ${d.label} (pulado)`),
    ...statusDocs.ausentes.map(d => `- ${d.label} (informado como ausente)`),
    ...statusDocs.parciais.map(d => `- ${d.label} (recebido parcialmente)`),
    ...statusDocs.pendentesFluxo.map(d => `- ${d.label}`)
  ]
  const blocoRecebidos = recebidos.length ? `\n\n✅ *Recebidos:*\n${recebidos.join("\n")}` : ""
  const blocoFaltantes = faltantes.length ? `\n\n⚠️ *Ainda faltam:*\n${faltantes.join("\n")}` : ""
  const textoBase = faltantes.length
    ? `🎉 *Muito bem, ${primeiroNome}!*\n\nRecebemos os documentos enviados para o caso *${u.numeroCaso}*.${blocoRecebidos}${blocoFaltantes}\n\nNossa equipe já pode organizar o material recebido. Se tiver os documentos faltantes depois, é só voltar em *Enviar documentos*.`
    : `🎉 *Muito bem, ${primeiroNome}!*\n\nRecebemos todos os documentos previstos para o caso *${u.numeroCaso}*.${blocoRecebidos}\n\nNossa equipe já pode analisar tudo com mais segurança.`
  return {
    texto: textoBase,
    imagemUrl: IMAGEM_DOCS_FINAL_URL,
    opcoes: [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

function telaEnvioDoc(u, enviarOpcoesPadrao) {
  const statusDocs = calcularStatusDocumentos(u)
  const pendentes = statusDocs.pendentesFluxo
  if (pendentes.length === 0) return telaConcluido(u)

  const doc      = pendentes[0]
  const statusVisual = montarStatusDocumentosVisual(u, {
    docEmAndamentoId: (u.docAtualIdx || 0) > 0 && u.ultimoArqId ? doc.id : null
  })
  const folhas   = doc.folhas || ["Foto do documento"]
  const rawFIdx  = Number.isFinite(Number(u.docAtualIdx)) ? Number(u.docAtualIdx) : 0
  const fIdx     = Math.min(Math.max(rawFIdx, 0), Math.max(folhas.length - 1, 0))
  if (u.docAtualIdx !== fIdx) u.docAtualIdx = fIdx
  const folha    = folhas[fIdx] || `Foto ${fIdx + 1}`
  const totalF   = folhas.length
  const folhasJaRecebidas = totalF > 1 && fIdx > 0 ? folhas.slice(0, fIdx).join(", ") : ""

  let texto = `📋 *Kit de documentos do caso*\n${statusVisual.texto}\n\n`
  texto += `*Guia do status*\n${statusVisual.legenda}\n\n`
  texto += `────────────────\n\n`
  texto += `🧭 *Bloco:* ${doc.grupo || "Documentos"}\n`
  texto += `📌 *Agora:* ${doc.label}\n`
  if (folhasJaRecebidas) texto += `✅ *Recebido:* ${folhasJaRecebidas}\n`
  texto += `📄 *${folhasJaRecebidas ? "Falta" : "Envie"}:* ${folha}`
  if (totalF > 1) texto += ` (${fIdx + 1} de ${totalF})`
  texto += `\n✅ *Aceita:* ${doc.aceita || "foto ou PDF"}`
  if (doc.id === "doc_rg") texto += `\nℹ️ Se frente e verso estiverem na mesma imagem, envie assim mesmo.`
  if (doc.obrigatorio === false) texto += `\nℹ️ *Opcional:* envie se tiver disponível.`
  texto += `\n\n💡 *Dica:* ${doc.dica}`
  texto += `\n\n📲 *Envie aqui pelo WhatsApp quando estiver pronto.*`

  // CPF é opcional — oferecer opção de pular
  if (doc.id === "doc_cpf") {
    return {
      texto,
      opcoes: [
        { id: "doc_cpf_skip", title: "CPF no RG/CNH" },
    { id: "docs_depois", title: "Continuar depois" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
      ]
    }
  }

  return {
    texto,
    opcoes: enviarOpcoesPadrao(null)
  }
}

module.exports = {
  limparTextoAudioDoc,
  fraseEnvioDocumentoAudio,
  textoAudioTelaDocumentoCaso,
  imagemPorAreaTipo,
  imagemPorCaso,
  telaDocsPendentesComImagem,
  montarStatusDocumentosVisual,
  telaConcluido,
  telaEnvioDoc,
  IMAGEM_DOCS_FINAL_URL
}
