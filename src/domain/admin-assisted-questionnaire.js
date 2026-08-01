"use strict"

const GENERAL_FIELDS = Object.freeze([
  { campo: "nomeCompleto", grupo: "Identificação", obrigatorio: true },
  { campo: "telefone", grupo: "Contato", obrigatorio: true },
  { campo: "email", grupo: "Contato", obrigatorio: false },
  { campo: "cpf", grupo: "Identificação", obrigatorio: false },
  { campo: "cidade", grupo: "Contato", obrigatorio: true },
  { campo: "uf", grupo: "Contato", obrigatorio: true },
  { campo: "descricao", grupo: "Caso", obrigatorio: true },
  { campo: "objetivo", grupo: "Caso", obrigatorio: false },
  { campo: "documentosMencionados", grupo: "Documentos", obrigatorio: false },
  { campo: "urgencia", grupo: "Caso", obrigatorio: false },
  { campo: "conflitoInteresses", grupo: "Caso", obrigatorio: false }
])

const AREA_FIELDS = Object.freeze({
  INSS: ["estadoCivil", "endereco", "situacaoProfissional", "motivoEncerramentoVinculo", "acidenteTrabalho", "limitacoesAtuais", "atividadeHabitual", "composicaoFamiliar", "rendaAtual", "beneficio", "beneficioAnterior", "dataRequerimento", "resultadoPericia", "documentosMedicos", "orgao"],
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
  return [...GENERAL_FIELDS, ...especificos.map(campo => ({ campo, grupo: "Dados da área", obrigatorio: false }))]
}

function respondido(dados, campo) {
  const info = dados?.[campo]
  return Boolean(info && !["ausente", "invalido"].includes(info.status) && info.valor !== null && info.valor !== undefined && String(info.valor).trim() !== "")
}

function proximaPerguntaAdminAssistido({ questionario = [], dados = {}, perguntados = [] } = {}) {
  const ignorados = new Set(perguntados)
  const pendentes = questionario.filter(item => !respondido(dados, item.campo) && !ignorados.has(item.campo))
  const item = pendentes[0]
  if (!item) return null
  const concluidos = questionario.filter(def => respondido(dados, def.campo) || ignorados.has(def.campo)).length
  return {
    ...item,
    etapa: concluidos + 1,
    total: questionario.length,
    texto: `Etapa ${concluidos + 1} de ${questionario.length}`
  }
}

module.exports = { GENERAL_FIELDS, AREA_FIELDS, criarQuestionarioAdminAssistido, proximaPerguntaAdminAssistido }
