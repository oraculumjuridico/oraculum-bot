"use strict"

const crypto = require("node:crypto")
const path = require("node:path")
const { normalizePersonName } = require("./name-normalization")
const { normalizarTelefone } = require("./phone-name")

const SECRET_LABEL = /(senha|password|token|secret|chave|credential|api[_ -]?key|connection\s*string)/i
const FIELD_LINE = /^\s*(?:[-*]\s*)?([^:\n]{2,60}):\s*(.*)$/

function plain(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

function tokens(value) {
  return new Set(plain(value).split(/\s+/).filter(word => word.length > 1))
}

function similarity(left, right) {
  const a = tokens(left), b = tokens(right)
  if (!a.size || !b.size) return 0
  const common = [...a].filter(value => b.has(value)).length
  return common / Math.max(a.size, b.size)
}

function redactSecrets(text) {
  return String(text || "").split(/\r?\n/).filter(line => {
    const match = line.match(FIELD_LINE)
    return !match || !SECRET_LABEL.test(match[1])
  }).join("\n")
}

function parseMarkdownCases(text, source) {
  const safe = redactSecrets(text).replace(/^\uFEFF/, "")
  const lines = safe.split(/\r?\n/)
  const blocks = []
  let current = null
  for (const line of lines) {
    const heading = line.match(/^(##)\s+(.+?)\s*$/)
    if (heading) {
      if (current) blocks.push(current)
      current = { source, heading: heading[2].trim(), fields: {}, body: [] }
      continue
    }
    if (!current) continue
    current.body.push(line)
    const field = line.match(FIELD_LINE)
    if (!field || SECRET_LABEL.test(field[1])) continue
    const label = plain(field[1])
    const value = field[2].trim()
    if (value) current.fields[label] = value
  }
  if (current) blocks.push(current)
  return blocks.filter(block => block.heading && block.body.some(line => line.trim()))
}

function matchMarkdownBlock(caseName, blocks) {
  const ranked = blocks.map(block => ({ block, score: similarity(caseName, block.heading) }))
    .sort((a, b) => b.score - a.score)
  if (!ranked[0] || ranked[0].score < 0.6) return { block: null, reason: "markdown_sem_correspondencia_forte" }
  if (ranked[1] && ranked[0].score === ranked[1].score && ranked[0].block.heading !== ranked[1].block.heading) {
    return { block: null, reason: "markdown_correspondencia_ambigua" }
  }
  return { block: ranked[0].block, score: ranked[0].score }
}

function firstField(block, names) {
  if (!block) return ""
  for (const name of names.map(plain)) if (block.fields[name]) return block.fields[name]
  return ""
}

function plausibleName(value) {
  const normalized = normalizePersonName(String(value || "").replace(/\([^)]*\)/g, " "))
  if (!/^[\p{L}' -]{3,}$/u.test(normalized)) return ""
  if (normalized.split(/\s+/).length < 2) return ""
  return normalized
}

function cleanOfficialName(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  const upper = text.toUpperCase()
  const suffixes = [
    "DATA DE NASCIMENTO",
    "NOME DA MAE",
    "NOME DO PAI",
    "NOME COMPLETO",
    "NOME SOCIAL",
    "CPF",
    "RG",
    "CNH",
    "TELEFONE",
    "E-MAIL",
    "EMAIL",
    "ENDERECO",
    "DOCUMENTO",
    "CERTIDAO",
    "PROCESSO",
    "PROTOCOLO",
    "BENEFICIO",
    "RESPONSAVEL",
    "SEXO",
    "COR",
    "REGISTRO",
    "CARTORIO",
    "LOCAL",
    "NUMERO",
    "LIVRO",
    "FOLHA",
    "MATRICULA",
    "TERMO",
    "EMISSAO",
    "COMPLEMENTO",
    "INTEGRANTES",
    "PROFISSAO",
    "ATIVIDADE",
    "ORIGEM",
    "INDICACAO",
    "PASTA",
    "ARQUIVO",
    "TIPO",
    "CATEGORIA",
    "CLASSIFICACAO",
    "STATUS",
    "FASE",
    "ESTAGIO",
    "PRIORIDADE",
    "TEMPERATURA",
    "AREA",
    "SUBTIPO",
    "SITUACAO",
    "ESTADO",
    "UF",
    "CEP",
    "BAIRRO",
    "CIDADE",
    "NIS",
    "PIS",
    "PASEP"
  ]
  for (const suffix of suffixes) {
    const index = upper.lastIndexOf(suffix)
    if (index >= 0) {
      const before = text.slice(0, index).trim()
      if (before.length >= 3 && before.split(/\s+/).length >= 2) return before
    }
  }
  return text
}

function phone(value) {
  try { return normalizarTelefone(value) } catch { return "" }
}

function classifyParties(block, holderName) {
  const referrer = firstField(block, ["Ref", "Referência", "Indicado por"])
  const parties = firstField(block, ["Partes"])
  const thirdParties = parties && plain(parties) !== plain(holderName) ? parties : ""
  return { referrer, thirdParties }
}

function evidenceForCase({ record, files, blocks }) {
  const matches = blocks.map(group => matchMarkdownBlock(record.name, group)).filter(item => item.block)
  const uniqueMatches = [...new Map(matches.map(item => [plain(item.block.heading), item])).values()]
  const block = uniqueMatches.length === 1 ? uniqueMatches[0].block : null
  const reviewReasons = []
  if (uniqueMatches.length > 1) reviewReasons.push("fontes_markdown_divergentes")
  if (!block) reviewReasons.push("identidade_sem_bloco_markdown_inequivoco")

  const officialCandidate = plausibleName(firstField(block, ["Segurado", "Titular", "Nome completo", "Cliente"]))
  const headingCandidate = plausibleName(block?.heading)
  const folderCandidate = plausibleName(record.name)
  const officialName = officialCandidate || headingCandidate || folderCandidate
  if (!officialCandidate && !headingCandidate) reviewReasons.push("nome_sem_fonte_nominal_markdown")

  const phoneCandidates = [
    firstField(block, ["Telefone"]), firstField(block, ["Cel", "Celular"])
  ].map(phone).filter(Boolean)
  const uniquePhones = [...new Set(phoneCandidates)]
  const clientPhone = uniquePhones.length === 1 ? uniquePhones[0] : ""
  if (uniquePhones.length > 1) reviewReasons.push("telefones_do_titular_conflitantes")

  const { referrer, thirdParties } = classifyParties(block, officialName)
  const body = block ? block.body.map(line => line.trim()).filter(Boolean) : []
  const safeBody = body.filter(line => !SECRET_LABEL.test(line)).slice(0, 45)
  const fileNames = files.map(file => path.basename(file))
  return {
    officialName, clientPhone, referrer, thirdParties, block,
    facts: safeBody,
    provenance: [
      officialCandidate ? "markdown:campo_segurado" : headingCandidate ? "markdown:titulo_bloco" : "pasta:cliente",
      clientPhone ? "markdown:telefone_titular" : null,
      referrer ? "markdown:referencia" : null,
      thirdParties ? "markdown:partes" : null,
      `acervo:${fileNames.length}_arquivos`
    ].filter(Boolean),
    reviewReasons: [...new Set(reviewReasons)]
  }
}

function summarizeCase({ caseNumber, classification, evidence, categories, driveUrl, fileCount, signals = {}, legalAnalysis = {} }) {
  const facts = evidence.facts.length
    ? evidence.facts.map(value => `- ${value}`).join("\n")
    : "- Não há relato textual inequivocamente associado nas fontes Markdown."
  const review = evidence.reviewReasons.length ? evidence.reviewReasons.join("; ") : "Nenhuma divergência concreta detectada."
  const pending = evidence.reviewReasons.length
    ? `Resolver: ${review}. Responsável: equipe jurídica; prioridade: antes do protocolo ou peticionamento.`
    : "Conferir atualidade documental antes do próximo protocolo. Responsável: equipe jurídica."
  return [
    "RESUMO DO CASO",
    `Número interno: ${caseNumber}`,
    "Área: Previdenciário (INSS)",
    `Tipo: ${classification.label}`,
    "Situação: acervo reconciliado com as fontes locais e CRM.",
    "",
    "IDENTIFICAÇÃO DO CLIENTE",
    `Titular: ${evidence.officialName || "não comprovado"}`,
    `Origem/indicação: ${evidence.referrer ? "identificação preservada em campo próprio" : "não comprovada"}.`,
    `Terceiros: ${evidence.thirdParties ? "identificados separadamente" : "não identificados nas fontes associadas"}.`,
    "",
    "HISTÓRICO E RELATO DISPONÍVEL",
    facts,
    ...(signals.events?.length ? ["", "EVENTOS DOCUMENTAIS", ...signals.events.map(value => `- ${value}`)] : []),
    "",
    "INFORMAÇÕES PREVIDENCIÁRIAS E PROCESSUAIS",
    `Datas identificadas: ${signals.dates?.length ? signals.dates.join("; ") : "não confirmadas"}.`,
    `Períodos identificados: ${signals.periods?.length ? signals.periods.join("; ") : "não confirmados"}.`,
    `NB identificados: ${signals.benefitNumbers?.length ? signals.benefitNumbers.join("; ") : "não confirmado"}.`,
    `Protocolos identificados: ${signals.protocols?.length ? signals.protocols.join("; ") : "não confirmados"}.`,
    `Processos identificados: ${signals.processNumbers?.length ? signals.processNumbers.join("; ") : "não confirmados"}.`,
    "",
    "ANÁLISE DOCUMENTAL",
    `Foram inventariados ${fileCount} arquivos, organizados nas categorias: ${categories.join("; ") || "outros documentos"}.`,
    "Os fatos acima provêm do bloco Markdown inequivocamente associado; nomes de arquivos são apenas apoio e não prevalecem sobre documento oficial.",
    "",
    "DOCUMENTOS PENDENTES",
    pending,
    "",
    "ANÁLISE PRELIMINAR",
    `Enquadramento aparente: ${classification.label}.`,
    `Revisão concreta: ${review}`,
    "A análise é preliminar e não substitui revisão jurídica nem conclusão médica.",
    "",
    "ESTRATÉGIAS POSSÍVEIS",
    ...(legalAnalysis.documentosPendentes?.length
      ? [`- Regularização documental: obter ${legalAnalysis.documentosPendentes.slice(0, 6).join("; ")}.`]
      : ["- Prosseguir com a medida previdenciária compatível após conferência final do conjunto."]),
    ...(legalAnalysis.riscosIdentificados || []).map(value => `- Mitigar: ${value}`),
    "- As estratégias são preliminares e dependem de validação do advogado.",
    "",
    "PRÓXIMA AÇÃO",
    evidence.reviewReasons.length
      ? "Equipe jurídica: resolver as divergências concretas listadas e então definir a medida previdenciária cabível."
      : "Equipe jurídica: revisar a atualidade dos documentos e dar seguimento à medida previdenciária indicada pelo histórico.",
    "",
    "PROVENIÊNCIA",
    evidence.provenance.join("; "),
    "",
    "GOOGLE DRIVE",
    `Pasta do caso: ${driveUrl}`
  ].join("\n")
}

function preserve(existing, candidate) {
  const current = String(existing || "").trim()
  const next = String(candidate || "").trim()
  return next || current
}

function caseFingerprint(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16)
}

function extractCaseSignals(text) {
  const safe = redactSecrets(text)
  const unique = values => [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))]
  const dates = unique(safe.match(/\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/g) || [])
  const periods = unique(safe.match(/\b(?:desde|entre|de|a partir de)\s+(?:\d{1,2}[/-])?(?:\d{1,2}[/-])?(?:19|20)\d{2}(?:\s+(?:a|até)\s+(?:\d{1,2}[/-])?(?:\d{1,2}[/-])?(?:19|20)\d{2})?/gi) || [])
  const protocols = unique((safe.match(/\b\d{8,21}\b/g) || []).filter(value => value.length !== 11)).slice(0, 12)
  const benefitNumbers = unique([...safe.matchAll(/\b(?:NB|benef[ií]cio)\s*[:ºn.-]*\s*(\d[\d .-]{7,20})/gi)].map(match => match[1].replace(/\D/g, ""))).slice(0, 6)
  const processNumbers = unique(safe.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || []).slice(0, 6)
  const officialNameCandidates = unique([...safe.matchAll(/\b(?:nome(?:\s+completo)?|segurado|requerente|titular)\s*[:\-]\s*([A-ZÀ-Ý][A-ZÀ-Ý' -]{5,80})/gi)]
    .map(match => cleanOfficialName(plausibleName(match[1])))).filter(Boolean)
  const events = safe.split(/\r?\n/).map(line => line.trim()).filter(line =>
    /\b(requer\w*|protocol\w*|per[ií]cia\w*|indefer\w*|conced\w*|cess\w*|suspend\w*|recurso\w*|exig[eê]ncia\w*|decis[aã]o\w*|laudo\w*|atestado\w*|cad[uú]nico|cras)\b/i.test(line)
  ).slice(0, 20)
  return { dates, periods, protocols, benefitNumbers, processNumbers, officialNameCandidates, events }
}

module.exports = {
  redactSecrets, parseMarkdownCases, matchMarkdownBlock, evidenceForCase,
  summarizeCase, preserve, similarity, caseFingerprint, extractCaseSignals
}
