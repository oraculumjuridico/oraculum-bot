"use strict"

const { ESTADOS_EXTENSO, buscarPorCEP, buscarCidadePorNomeInteligente } = require("./geo-search")
const { isBpcCase, nextFamilyMember, memberFieldId } = require("./bpc-legal-facts")

const GENERIC_DOCUMENT = "Documentos existentes, ainda não identificados"
const REGISTRATION_STATUS = Object.freeze({ INITIAL: "cadastro_inicial", COMPLEMENTATION: "aguardando_complementacao", DOCUMENTS: "aguardando_documentos", REVIEW: "em_revisao_humana", COMPLETE: "cadastro_completo" })

const GENERAL_QUESTIONS = Object.freeze([
  { id: "nomeCompleto", group: "Identificação", priority: 10, required: true, admin: "Qual é o nome completo do cliente?", client: "Qual é o seu nome completo?", target: "contact", documentExtractable: true },
  { id: "telefone", group: "Contato", priority: 20, required: true, admin: "Qual é o telefone do cliente?", client: "Qual é o seu telefone?", target: "contact" },
  { id: "cidade", group: "Contato", priority: 21, required: true, admin: "Qual é a cidade ou o CEP do cliente?", client: "Qual é a sua cidade ou CEP?", target: "contact", documentExtractable: true },
  { id: "uf", group: "Contato", priority: 22, required: true, admin: "Qual é o estado (UF) do cliente?", client: "Qual é o seu estado (UF)?", target: "contact", documentExtractable: true },
  { id: "cpf", group: "Identificação", priority: 23, required: false, admin: "Qual é o CPF do cliente?", client: "Qual é o seu CPF?", target: "contact", documentExtractable: true },
  { id: "dataNascimento", group: "Identificação", priority: 24, required: false, admin: "Qual é a data de nascimento do cliente?", client: "Qual é a sua data de nascimento?", target: "contact", documentExtractable: true },
  { id: "areaJuridica", group: "Caso", priority: 25, required: true, admin: "Qual é a área jurídica do caso?", client: "Qual é a área do seu caso?", target: "deal" },
  { id: "tipoCaso", group: "Caso", priority: 26, required: true, admin: "Qual é o tipo da demanda?", client: "Qual é o tipo da sua demanda?", target: "deal" },
  { id: "descricao", group: "Caso", priority: 30, required: true, admin: "Descreva o problema jurídico principal.", client: "Conte resumidamente o que aconteceu.", target: "deal" },
  { id: "objetivo", group: "Caso", priority: 35, required: false, admin: "Qual é o objetivo do cliente?", client: "O que você pretende obter com o atendimento?", target: "deal" },
  { id: "urgencia", group: "Caso", priority: 40, required: false, admin: "Existe prazo ou urgência?", client: "Existe algum prazo ou risco urgente?", target: "deal", skippable: true },
  { id: "email", group: "Contato", priority: 60, required: false, admin: "Qual é o e-mail do cliente?", client: "Qual é o seu e-mail?", target: "contact", skippable: true }
])

const AREA_QUESTIONS = Object.freeze({
  INSS: [
    { id: "beneficio", required: true, admin: "Qual benefício ou requerimento está envolvido?", client: "Qual benefício ou requerimento está envolvido?", postHuman: true },
    { id: "bpcRequerenteTipo", postHumanOnly: true, client: "O pedido de BPC é para uma criança, uma pessoa adulta ou uma pessoa idosa?", postHuman: ({ data }) => isBpcCase(data) },
    { id: "bpcDeficiencia", postHumanOnly: true, client: "Qual deficiência ou condição relevante foi informada para o requerente do BPC?", postHuman: ({ data }) => isBpcDisability(data) },
    { id: "bpcImpedimentoLongoPrazo", postHumanOnly: true, client: "Essa condição causa impedimentos de longo prazo?", postHuman: ({ data }) => isBpcDisability(data) },
    { id: "bpcComposicaoFamiliar", postHumanOnly: true, client: "Quem mora com o requerente na mesma casa?", postHuman: ({ data }) => isBpcCase(data) },
    { id: "bpcDespesas", postHumanOnly: true, client: "Há gastos importantes relacionados à saúde ou à deficiência que pesam no orçamento da família?", postHuman: ({ data }) => isBpcDisability(data) },
    { id: "bpcCadUnico", postHumanOnly: true, client: "O requerente possui CadÚnico? Se souber, informe também se está atualizado.", postHuman: ({ data }) => isBpcCase(data) },
    { id: "bpcSituacaoAdministrativa", postHumanOnly: true, client: "Já houve pedido de BPC? Se houve, ele foi concedido, negado ou ainda está em análise?", postHuman: ({ data }) => isBpcCase(data) },
    { id: "motivo", required: true, admin: "Qual foi o motivo da decisão do INSS?", client: "Qual foi o motivo informado pelo INSS?", postHuman: ({ data }) => isDenied(data) },
    { id: "dataRequerimento", condition: ({ data }) => /requer|indefer|recurso/i.test(value(data, "tipoCaso") + " " + value(data, "descricao")), admin: "Qual é a data do requerimento ou da decisão?", client: "Qual é a data do requerimento ou da decisão?", postHuman: ({ data }) => hasApplication(data) },
    { id: "houvePericia", postHumanOnly: true, client: "Você passou por perícia do INSS?", postHuman: ({ data }) => isIncapacity(data) },
    { id: "dataPericia", postHumanOnly: true, client: "Qual foi a data da perícia?", postHuman: ({ data }) => isTrue(data, "houvePericia") },
    { id: "inicioIncapacidade", postHumanOnly: true, client: "Quando começou a incapacidade para o trabalho?", postHuman: ({ data }) => isIncapacity(data) },
    { id: "incapacidadeAtual", postHumanOnly: true, client: "A incapacidade para o trabalho continua atualmente?", postHuman: ({ data }) => isIncapacity(data) },
    { id: "limitacoesAtuais", postHumanOnly: true, client: "Quais limitações você tem hoje para realizar seu trabalho?", postHuman: ({ data }) => isIncapacity(data) && !isFalse(data, "incapacidadeAtual") },
    { id: "atividadeHabitual", postHumanOnly: true, client: "Qual é ou era sua atividade profissional habitual?", postHuman: ({ data }) => isIncapacity(data) },
    { id: "vinculosContribuicoes", postHumanOnly: true, client: "Há algum problema nos vínculos ou contribuições do CNIS?", postHuman: ({ data }) => needsContributionHistory(data) },
    { id: "nb", condition: ({ data }) => /benef[ií]cio|cessad|revis/i.test(value(data, "descricao")), admin: "Qual é o número do benefício, se houver?", client: "Qual é o número do benefício, se houver?", skippable: true, postHuman: ({ data }) => needsBenefitNumber(data) },
    { id: "protocoloRequerimento", postHumanOnly: true, client: "Qual é o protocolo do requerimento específico?", postHuman: ({ data }) => needsApplicationProtocol(data) },
    { id: "cartaDecisaoAdministrativa", postHumanOnly: true, client: "Você recebeu a carta ou decisão administrativa do INSS?", postHuman: ({ data }) => isDenied(data) },
    { id: "recursoAdministrativo", postHumanOnly: true, client: "Foi apresentado recurso administrativo?", postHuman: ({ data }) => isDenied(data) },
    { id: "beneficioAnterior", postHumanOnly: true, client: "Você já recebeu benefício por incapacidade anteriormente?", postHuman: ({ data }) => isIncapacity(data) }
  ],
  Trabalhista: [
    { id: "empresa", required: true, admin: "Qual empresa está envolvida?", client: "Qual empresa está envolvida?" },
    { id: "motivo", required: true, admin: "O vínculo terminou? Por qual motivo?", client: "O vínculo terminou? Por qual motivo?" },
    { id: "cargo", postHumanOnly: true, postHuman: true, client: "Qual era sua função ou cargo e quais atividades realizava?" },
    { id: "dataAdmissao", postHumanOnly: true, postHuman: true, client: "Quando começou a trabalhar para essa empresa?" },
    { id: "dataDemissao", postHumanOnly: true, postHuman: true, client: "Quando o trabalho terminou ou quando ocorreu o problema principal?" },
    { id: "jornadaTrabalho", postHumanOnly: true, postHuman: true, client: "Qual era sua jornada habitual, incluindo dias, horários e intervalos?" },
    { id: "remuneracao", postHumanOnly: true, postHuman: true, client: "Qual era sua remuneração aproximada e como ela era paga?" },
    { id: "verbasPendentes", postHumanOnly: true, postHuman: true, client: "Quais pagamentos, verbas ou direitos ficaram pendentes?" },
    { id: "provasDisponiveis", postHumanOnly: true, postHuman: true, client: "Quais documentos, conversas, recibos ou testemunhas você possui?" }
  ],
  Família: [
    { id: "parteContraria", required: true, admin: "Quem é a outra parte?", client: "Quem é a outra parte?" },
    { id: "vinculoFamiliar", required: true, admin: "Qual é a relação familiar entre as partes?", client: "Qual é a relação familiar entre as partes?" },
    { id: "filhos", postHumanOnly: true, postHuman: true, client: "Há filhos ou dependentes envolvidos? Informe as idades e com quem moram." },
    { id: "acordoOuProcessoAnterior", postHumanOnly: true, postHuman: true, client: "Já existe acordo, decisão ou processo anterior entre as partes?" },
    { id: "situacaoAtual", postHumanOnly: true, postHuman: true, client: "Como está a situação atualmente e qual foi o último fato importante?" },
    { id: "objetivo", postHumanOnly: true, postHuman: true, client: "Qual resultado você espera obter?" },
    { id: "riscoImediato", postHumanOnly: true, postHuman: true, client: "Existe risco imediato, violência, retirada de criança ou outra urgência?" }
  ],
  Consumidor: [
    { id: "fornecedor", required: true, admin: "Qual fornecedor está envolvido?", client: "Qual fornecedor está envolvido?" },
    { id: "produtoServico", required: true, admin: "Qual produto ou serviço está envolvido?", client: "Qual produto ou serviço está envolvido?" },
    { id: "dataFato", postHumanOnly: true, postHuman: true, client: "Quando ocorreu a compra, contratação ou problema?" },
    { id: "valorEnvolvido", postHumanOnly: true, postHuman: true, client: "Qual valor foi pago, cobrado ou perdido aproximadamente?" },
    { id: "tentativaSolucao", postHumanOnly: true, postHuman: true, client: "Você tentou resolver com a empresa? Informe protocolos e respostas, se houver." },
    { id: "prejuizos", postHumanOnly: true, postHuman: true, client: "Quais prejuízos concretos esse problema causou?" },
    { id: "provasDisponiveis", postHumanOnly: true, postHuman: true, client: "Quais comprovantes, contratos, notas, conversas ou imagens você possui?" }
  ],
  Bancário: [
    { id: "fornecedor", required: true, admin: "Qual instituição financeira está envolvida?", client: "Qual instituição financeira está envolvida?" },
    { id: "problema", required: true, admin: "Qual é o problema bancário?", client: "Qual é o problema bancário?" },
    { id: "produtoServico", postHumanOnly: true, postHuman: true, client: "Qual conta, cartão, empréstimo ou serviço bancário está envolvido?" },
    { id: "dataFato", postHumanOnly: true, postHuman: true, client: "Quando começou a cobrança, desconto, bloqueio ou fraude?" },
    { id: "valorEnvolvido", postHumanOnly: true, postHuman: true, client: "Qual valor está envolvido e ele continua sendo cobrado ou descontado?" },
    { id: "autorizacaoOperacao", postHumanOnly: true, postHuman: true, client: "Você reconhece e autorizou a contratação ou transação?" },
    { id: "tentativaSolucao", postHumanOnly: true, postHuman: true, client: "Você contestou no banco? Informe protocolos e respostas, se houver." },
    { id: "provasDisponiveis", postHumanOnly: true, postHuman: true, client: "Quais extratos, faturas, contratos ou comprovantes você possui?" }
  ],
  Penal: [
    { id: "posicaoPenal", required: true, admin: "O cliente é vítima, investigado ou acusado?", client: "Você é vítima, investigado ou acusado?" },
    { id: "fatoPenal", postHumanOnly: true, postHuman: true, client: "O que aconteceu, quando e onde ocorreu?" },
    { id: "delegaciaOuProcesso", postHumanOnly: true, postHuman: true, client: "Existe boletim, inquérito, audiência ou processo? Informe os dados que souber." },
    { id: "custodiaOuMedida", postHumanOnly: true, postHuman: true, client: "Há prisão, medida protetiva, intimação ou restrição em vigor?" },
    { id: "prazoOuAudiencia", postHumanOnly: true, postHuman: true, client: "Existe audiência, prazo ou comparecimento marcado?" },
    { id: "provasDisponiveis", postHumanOnly: true, postHuman: true, client: "Quais documentos, mensagens, vídeos ou testemunhas existem?" }
  ],
  Civil: [
    { id: "parteContraria", required: true, admin: "Quem é a outra parte?", client: "Quem é a outra parte?" },
    { id: "contratoOuFato", required: true, admin: "Existe contrato ou qual fato originou a demanda?", client: "Existe contrato ou qual fato originou a demanda?" },
    { id: "dataFato", postHumanOnly: true, postHuman: true, client: "Quando ocorreu o fato ou começou o descumprimento?" },
    { id: "valorEnvolvido", postHumanOnly: true, postHuman: true, client: "Existe valor econômico envolvido? Qual é o valor aproximado?" },
    { id: "tentativaSolucao", postHumanOnly: true, postHuman: true, client: "Houve cobrança, notificação, acordo ou tentativa anterior de solução?" },
    { id: "provasDisponiveis", postHumanOnly: true, postHuman: true, client: "Quais contratos, recibos, conversas ou testemunhas existem?" },
    { id: "prazoOuAudiencia", postHumanOnly: true, postHuman: true, client: "Existe prazo, audiência ou risco de perda imediata?" }
  ],
  Imobiliário: [
    { id: "imovel", required: true, admin: "Qual imóvel está envolvido?", client: "Qual imóvel está envolvido?" },
    { id: "parteContraria", required: true, admin: "Quem é a outra parte?", client: "Quem é a outra parte?" },
    { id: "relacaoImovel", postHumanOnly: true, postHuman: true, client: "O caso envolve compra, venda, aluguel, posse, condomínio ou regularização?" },
    { id: "contratoOuRegistro", postHumanOnly: true, postHuman: true, client: "Existe contrato, escritura, matrícula ou outro registro do imóvel?" },
    { id: "situacaoPosse", postHumanOnly: true, postHuman: true, client: "Quem ocupa o imóvel atualmente e desde quando?" },
    { id: "valorEnvolvido", postHumanOnly: true, postHuman: true, client: "Há parcelas, aluguel, condomínio ou outro valor pendente?" },
    { id: "riscoImediato", postHumanOnly: true, postHuman: true, client: "Existe despejo, leilão, invasão, obra ou outro risco imediato?" },
    { id: "provasDisponiveis", postHumanOnly: true, postHuman: true, client: "Quais documentos, recibos, fotos ou conversas você possui?" }
  ],
  Outros: [
    { id: "parteContraria", postHumanOnly: true, postHuman: true, client: "Quem são as pessoas, empresas ou órgãos envolvidos?" },
    { id: "dataFato", postHumanOnly: true, postHuman: true, client: "Quando ocorreu o fato principal?" },
    { id: "objetivo", postHumanOnly: true, postHuman: true, client: "Qual resultado você espera obter?" },
    { id: "provasDisponiveis", postHumanOnly: true, postHuman: true, client: "Quais documentos ou outras provas você possui?" },
    { id: "prazoOuAudiencia", postHumanOnly: true, postHuman: true, client: "Existe prazo, audiência ou risco urgente?" }
  ]
})

function value(data, field) { return String(data?.[field]?.valor ?? data?.[field] ?? "").trim() }
function answered(data, field) { const item = data?.[field]; return !(item && typeof item === "object" && ["ausente", "invalido", "precisa_conferir", "contraditorio"].includes(item.status)) && Boolean(value(data, field)) }
function contextText(data = {}) { return ["tipoCaso", "descricao", "situacao", "beneficio", "motivo", "resultadoPericia", "bpcRequerenteTipo", "bpcDeficiencia", "bpcSituacaoAdministrativa"].map(field => value(data, field)).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }
function isIncapacity(data) { return /incapac|auxilio.?doenca|pericia|invalidez|afastad/.test(contextText(data)) }
function isDenied(data) { return /indefer|negad|recusad|nao conced/.test(contextText(data)) }
function hasApplication(data) {
  if (isBpcCase(data)) {
    const status = value(data, "bpcSituacaoAdministrativa")
    if (status === "nao_requerido") return false
    if (["requerido", "em_analise", "indeferido", "concedido"].includes(status)) return true
  }
  return isDenied(data) || /requer|pedido|protocolo|der\b|recurso/.test(contextText(data))
}
function isBpcDisability(data) { return isBpcCase(data) && value(data, "bpcRequerenteTipo") !== "idoso" }
function isTrue(data, field) { return value(data, field) === "true" || /^(sim|houve|realizada?)$/i.test(value(data, field)) }
function isFalse(data, field) { return value(data, field) === "false" || /^(nao|não|negativo)$/i.test(value(data, field)) }
function needsContributionHistory(data) { return /aposentadoria|cnis|contribui|vinculo/.test(contextText(data)) }
function needsBenefitNumber(data) { return /beneficio concedido|beneficio cessado|beneficio cortado|beneficio suspenso|beneficio revisado|\bnb\b/.test(contextText(data)) }
function needsApplicationProtocol(data) { return /multiplos? requerimentos?|mais de um requerimento|dois pedidos|distinguir (?:o )?requerimento|localizar (?:o )?requerimento|protocolo (?:necessario|obrigatorio|especifico)/.test(contextText(data)) }
function questionCatalog(area = "Outros", context = {}) { return [...GENERAL_QUESTIONS, ...(AREA_QUESTIONS[area] || AREA_QUESTIONS.Outros).filter(item => !item.postHumanOnly).map((item, index) => ({ group: "Dados da área", priority: 100 + index, target: "deal", ...item }))].filter(item => !item.condition || item.condition(context)) }
function pendingQuestions({ area = "Outros", data = {}, asked = [], deferred = [] } = {}) { const ignored = new Set([...asked.filter(id => answered(data, id)), ...deferred]); return questionCatalog(area, { data }).filter(item => !answered(data, item.id) && !ignored.has(item.id)) }
function pendingPostHumanLegalQuestions({ area = "Outros", data = {} } = {}) {
  const pending = (AREA_QUESTIONS[area] || AREA_QUESTIONS.Outros)
    .map((item, index) => ({ group: "Dados da área", priority: 100 + index, target: "deal", ...item }))
    .filter(item =>
      item.postHuman === true ||
      (typeof item.postHuman === "function" && item.postHuman({ data })) ||
      (area !== "INSS" && item.required === true)
    )
    .filter(item => !answered(data, item.id))
  if (area === "INSS" && isBpcCase(data) && answered(data, "bpcComposicaoFamiliar")) {
    const member = nextFamilyMember(data)
    if (member) {
      const id = memberFieldId(member.memberId)
      const position = pending.findIndex(item => item.id === "bpcDespesas")
      pending.splice(position < 0 ? pending.length : position, 0, {
        id,
        group: "Dados da área",
        priority: 104,
        target: "deal",
        postHumanOnly: true,
        client: `Qual é a situação de trabalho, renda ou benefício de ${member.label}?`
      })
    }
  }
  return pending
}

function normalizeDocumentName(input) { return String(input || "").trim().replace(/\s+/g, " ") }
function isGenericDocumentReference(input) { const text = normalizeDocumentName(input); return /^(alguns? documentos?|documenta[cç][aã]o(?: que possui)?|documentos? existentes?)$/i.test(text) || text === GENERIC_DOCUMENT }
function reconcileDocuments({ required = [], mentioned = [], received = [], quarantined = [], unidentified = false } = {}) {
  const clean = list => [...new Set((list || []).map(normalizeDocumentName).filter(Boolean).filter(item => !isGenericDocumentReference(item)))]
  const necessary = clean(required); const named = clean(mentioned); const accepted = clean(received); const review = clean(quarantined); const approved = new Set(accepted.map(item => item.toLocaleLowerCase("pt-BR")))
  return { required: necessary, mentioned: named, received: accepted, quarantined: review, unidentified: Boolean(unidentified || (mentioned || []).some(isGenericDocumentReference)), missing: necessary.filter(item => !approved.has(item.toLocaleLowerCase("pt-BR"))) }
}
function classifyInssDemand(input) { const text = String(input || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (/aposentadoria/.test(text) && /indefer/.test(text) && /cnis|vincul|contribui/.test(text)) return "Aposentadoria indeferida com necessidade de acerto do CNIS"; if (/beneficio/.test(text) && /cessad/.test(text)) return "Benefício cessado"; if (/recurso administrativo/.test(text)) return "Recurso administrativo"; if (/acerto.*cnis/.test(text)) return "Acerto de CNIS"; return null }
function registrationStatus({ pending = [], documents = {}, materialDivergence = false, resources = {} } = {}) { if (materialDivergence || (documents.quarantined || []).length) return REGISTRATION_STATUS.REVIEW; if ((documents.missing || []).length || documents.unidentified) return REGISTRATION_STATUS.DOCUMENTS; if (pending.length) return resources.negocioId ? REGISTRATION_STATUS.COMPLEMENTATION : REGISTRATION_STATUS.INITIAL; if (![resources.contatoId, resources.negocioId, resources.numeroCaso, resources.pastaDriveId].every(Boolean) || resources.associated !== true) return REGISTRATION_STATUS.INITIAL; return REGISTRATION_STATUS.COMPLETE }
function safeOcrUpdates({ current = {}, extraction = {}, allowlist = [], confidenceThreshold = 0.9, approved = false, principalIdentityMatch = false } = {}) { const updates = {}; const divergences = []; const pending = []; for (const [field, result] of Object.entries(extraction || {})) { if (!allowlist.includes(field) || !approved || !principalIdentityMatch || Number(result?.confidence) < confidenceThreshold) continue; const incoming = String(result?.value || "").trim(); if (!incoming) continue; const existing = String(current[field] || "").trim(); if (!existing) updates[field] = incoming; else if (existing.normalize("NFKC").toLowerCase() !== incoming.normalize("NFKC").toLowerCase()) { divergences.push({ field, existing, incoming }); pending.push(field) } } return { updates, divergences, pending, humanReviewRequired: divergences.length > 0 } }
function normalizeUf(input) { const normalized = String(input || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); for (const [uf, name] of Object.entries(ESTADOS_EXTENSO)) { const candidate = String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (normalized === uf.toLowerCase() || normalized === candidate) return uf } return null }
async function resolveCityOrCep(input, deps = {}) { const text = String(input || "").trim(); const digits = text.replace(/\D/g, ""); if (digits.length === 8) return (deps.searchCep || buscarPorCEP)(digits); const ufOnly = normalizeUf(text); if (ufOnly) return { uf: ufOnly, ufOnly: true }; return (await (deps.searchCity || buscarCidadePorNomeInteligente)(text)) || null }

module.exports = { GENERAL_QUESTIONS, AREA_QUESTIONS, GENERIC_DOCUMENT, REGISTRATION_STATUS, questionCatalog, pendingQuestions, pendingPostHumanLegalQuestions, reconcileDocuments, isGenericDocumentReference, classifyInssDemand, registrationStatus, safeOcrUpdates, normalizeUf, resolveCityOrCep, answered }
