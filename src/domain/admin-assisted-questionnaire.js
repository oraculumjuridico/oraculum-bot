"use strict"

const { questionCatalog } = require("./admin-assisted-intake-catalog")

const GENERAL_FIELDS = Object.freeze([
  { campo: "nomeCompleto", grupo: "Identificação", obrigatorio: true, prioridade: 10 },
  { campo: "telefone", grupo: "Contato", obrigatorio: true, prioridade: 20 },
  { campo: "cidade", grupo: "Contato", obrigatorio: true, prioridade: 21 },
  { campo: "uf", grupo: "Contato", obrigatorio: true, prioridade: 22 },
  { campo: "cpf", grupo: "Identificação", obrigatorio: false, prioridade: 23 },
  { campo: "areaJuridica", grupo: "Caso", obrigatorio: true, prioridade: 25 },
  { campo: "descricao", grupo: "Caso", obrigatorio: true, prioridade: 30 },
  { campo: "objetivo", grupo: "Caso", obrigatorio: false, prioridade: 35 },
  { campo: "urgencia", grupo: "Caso", obrigatorio: false, prioridade: 40 },
  { campo: "email", grupo: "Contato", obrigatorio: false, prioridade: 60 },
  { campo: "documentosMencionados", grupo: "Documentos", obrigatorio: false, prioridade: 70 },
  { campo: "conflitoInteresses", grupo: "Caso", obrigatorio: false, prioridade: 80 }
])

const AREA_FIELDS = Object.freeze({
  INSS: ["beneficio", "dataRequerimento", "resultadoPericia", "limitacoesAtuais", "documentosMedicos", "acidenteTrabalho", "atividadeHabitual", "situacaoProfissional", "beneficioAnterior", "orgao", "rendaAtual", "composicaoFamiliar", "motivoEncerramentoVinculo", "estadoCivil", "endereco"],
  Trabalhista: ["empresa", "cargo", "dataAdmissao", "dataDemissao", "motivoEncerramentoVinculo", "acidenteTrabalho", "situacaoProfissional"],
  Família: ["vinculoFamiliar", "filhos", "parteContraria"],
  Consumidor: ["fornecedor", "produtoServico", "problema"],
  Bancário: ["fornecedor", "produtoServico", "problema", "contratoOuFato"],
  Penal: ["posicaoPenal", "parteContraria", "situacao"],
  Civil: ["parteContraria", "contratoOuFato", "motivo"],
  Imobiliário: ["imovel", "parteContraria", "motivo"],
  Outros: ["motivo", "situacao"]
})

function criarQuestionarioAdminAssistido(area = "Outros") {
  const especificos = AREA_FIELDS[area] || AREA_FIELDS.Outros
  return [...GENERAL_FIELDS, ...especificos.map((campo, indice) => ({
    campo,
    grupo: "Dados da área",
    obrigatorio: false,
    prioridade: 100 + indice
  }))]
}

// A definição canônica fica no catálogo compartilhado por Admin e pós-humano.
function criarQuestionarioCatalogadoAdminAssistido(area = "Outros") {
  return questionCatalog(area).map(item => ({
    campo: item.id,
    grupo: item.group,
    obrigatorio: Boolean(item.required),
    prioridade: item.priority,
    perguntaAdmin: item.admin,
    perguntaCliente: item.client,
    destino: item.target,
    podeInformarDepois: Boolean(item.skippable),
    extraivelDocumento: Boolean(item.documentExtractable)
  }))
}

function respondido(dados, campo) {
  const info = dados?.[campo]
  return Boolean(
    info &&
    !["ausente", "invalido", "precisa_conferir", "contraditorio"].includes(info.status) &&
    info.valor !== null && info.valor !== undefined && String(info.valor).trim() !== ""
  )
}

function proximaPerguntaAdminAssistido({ questionario = [], dados = {}, perguntados = [] } = {}) {
  const ignorados = new Set(perguntados)
  const pendentes = questionario
    .filter(item => !respondido(dados, item.campo) && !ignorados.has(item.campo))
    .sort((a, b) => (a.prioridade ?? 999) - (b.prioridade ?? 999))
  const item = pendentes[0]
  if (!item) return null
  const concluidos = questionario.filter(def => respondido(dados, def.campo) || ignorados.has(def.campo)).length
  return {
    ...item,
    etapa: concluidos + 1,
    total: questionario.length,
    texto: `Próxima informação: ${item.campo}`
  }
}

module.exports = { GENERAL_FIELDS, AREA_FIELDS, criarQuestionarioAdminAssistido: criarQuestionarioCatalogadoAdminAssistido, proximaPerguntaAdminAssistido }
