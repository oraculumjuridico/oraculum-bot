const AREAS_JURIDICAS_ADMIN_ASSISTIDO = [
  "INSS",
  "Trabalhista",
  "Família",
  "Consumidor",
  "Bancário",
  "Penal",
  "Civil",
  "Imobiliário",
  "Outros"
]

const STATUS_CAMPO_ADMIN_ASSISTIDO = new Set(["confirmado", "inferido", "ausente"])

const CAMPOS_ADMIN_ASSISTIDO = {
  nomeCompleto: {
    label: "Nome",
    pergunta: "Qual é o nome completo do cliente principal?"
  },
  cpf: {
    label: "CPF",
    pergunta: "Qual é o CPF do cliente principal?"
  },
  dataNascimento: {
    label: "Data de nascimento",
    pergunta: "Qual é a data de nascimento do cliente principal?"
  },
  telefone: {
    label: "Telefone",
    pergunta: "Qual é o telefone ou WhatsApp do cliente principal?"
  },
  email: {
    label: "E-mail",
    pergunta: "Qual é o e-mail do cliente principal?"
  },
  cidade: {
    label: "Cidade",
    pergunta: "Em qual cidade o cliente principal mora?"
  },
  uf: {
    label: "UF",
    pergunta: "Qual é o estado (UF) do cliente principal?"
  },
  areaJuridica: {
    label: "Área jurídica",
    pergunta: "Qual é a área jurídica do caso?"
  },
  tipoCaso: {
    label: "Tipo do caso",
    pergunta: "Qual é o tipo do caso?"
  },
  descricao: {
    label: "Descrição",
    pergunta: "Descreva o problema jurídico principal em uma ou duas frases."
  },
  clientePrincipal: {
    label: "Cliente principal",
    pergunta: "Quem é a pessoa que será cliente principal do caso?"
  },
  existeTerceiro: {
    label: "Terceiro",
    pergunta: "Existe terceiro ou representante envolvido no atendimento?"
  },
  resumoJuridico: {
    label: "Resumo jurídico",
    pergunta: "Qual é o resumo jurídico do caso?"
  },
  empresa: {
    label: "Empresa",
    pergunta: "Qual é o nome da empresa envolvida?"
  },
  motivo: {
    label: "Motivo",
    pergunta: "Qual é o motivo principal do caso?"
  },
  beneficio: {
    label: "Benefício",
    pergunta: "Qual benefício previdenciário está envolvido?"
  },
  nb: {
    label: "NB",
    pergunta: "Qual é o número do benefício (NB), se houver?"
  },
  dataNegativa: {
    label: "Data da negativa",
    pergunta: "Qual foi a data da negativa do benefício?"
  },
  situacao: {
    label: "Situação",
    pergunta: "Qual é a situação atual do caso?"
  },
  parteContraria: {
    label: "Parte contrária",
    pergunta: "Quem é a outra parte envolvida?"
  },
  vinculoFamiliar: {
    label: "Relação familiar",
    pergunta: "Qual é a relação familiar entre as partes?"
  },
  filhos: {
    label: "Filhos",
    pergunta: "Há filhos envolvidos?"
  },
  objetivo: {
    label: "Objetivo",
    pergunta: "Qual é o objetivo principal do cliente?"
  },
  fornecedor: {
    label: "Fornecedor",
    pergunta: "Qual empresa, banco ou fornecedor está envolvido?"
  },
  produtoServico: {
    label: "Produto/Serviço",
    pergunta: "Qual produto ou serviço gerou o problema?"
  },
  problema: {
    label: "Problema",
    pergunta: "Qual é o problema principal?"
  },
  documentosMencionados: {
    label: "Documentos",
    pergunta: "Quais documentos foram mencionados?"
  },
  urgencia: {
    label: "Urgência",
    pergunta: "Existe urgência, prazo ou risco imediato?"
  },
  posicaoPenal: {
    label: "Posição penal",
    pergunta: "O cliente é vítima, acusado ou familiar de alguém envolvido?"
  },
  contratoOuFato: {
    label: "Contrato ou fato",
    pergunta: "Qual contrato ou fato civil está envolvido?"
  },
  imovel: {
    label: "Imóvel",
    pergunta: "Qual imóvel está envolvido no caso?"
  },
  cargo: {
    label: "Cargo",
    pergunta: "Qual era o cargo do cliente?"
  },
  dataAdmissao: {
    label: "Data admissão",
    pergunta: "Qual foi a data de admissão?"
  },
  dataDemissao: {
    label: "Data demissão",
    pergunta: "Qual foi a data de demissão?"
  }
}

const OBRIGATORIOS_BASE = [
  "nomeCompleto",
  "telefone",
  "cidade",
  "uf",
  "areaJuridica",
  "tipoCaso",
  "descricao"
]

const CAMPOS_OBRIGATORIOS_POR_AREA = {
  INSS: [...OBRIGATORIOS_BASE, "cpf", "dataNascimento", "beneficio", "motivo"],
  Trabalhista: [...OBRIGATORIOS_BASE, "cpf", "empresa", "motivo"],
  Família: [...OBRIGATORIOS_BASE, "cpf", "parteContraria", "vinculoFamiliar"],
  Consumidor: [...OBRIGATORIOS_BASE, "cpf", "fornecedor", "produtoServico"],
  Bancário: [...OBRIGATORIOS_BASE, "cpf", "fornecedor", "produtoServico", "problema"],
  Penal: [...OBRIGATORIOS_BASE, "cpf", "posicaoPenal"],
  Civil: [...OBRIGATORIOS_BASE, "cpf", "parteContraria", "contratoOuFato"],
  Imobiliário: [...OBRIGATORIOS_BASE, "cpf", "imovel", "parteContraria"],
  Outros: [...OBRIGATORIOS_BASE, "cpf"]
}

const PRIORIDADE_CAMPOS_ADMIN_ASSISTIDO = [
  "nomeCompleto",
  "telefone",
  "cidade",
  "uf",
  "cpf",
  "dataNascimento",
  "areaJuridica",
  "tipoCaso",
  "descricao",
  "beneficio",
  "empresa",
  "motivo",
  "parteContraria",
  "vinculoFamiliar",
  "fornecedor",
  "produtoServico",
  "problema",
  "posicaoPenal",
  "contratoOuFato",
  "imovel"
]

const CAMPOS_REVISAO_ESPECIFICOS_POR_AREA = {
  INSS: ["beneficio", "nb", "dataNegativa", "situacao", "motivo"],
  Trabalhista: ["empresa", "cargo", "dataAdmissao", "dataDemissao", "motivo"],
  Família: ["vinculoFamiliar", "filhos", "objetivo", "parteContraria"],
  Consumidor: ["fornecedor", "produtoServico", "problema"],
  Bancário: ["fornecedor", "produtoServico", "problema", "contratoOuFato"],
  Penal: ["posicaoPenal", "parteContraria", "situacao"],
  Civil: ["parteContraria", "contratoOuFato", "motivo"],
  Imobiliário: ["imovel", "parteContraria", "motivo"],
  Outros: ["motivo", "situacao"]
}

function normalizarAreaJuridicaAdminAssistido(area) {
  const texto = String(area || "").trim().toLowerCase()
  const encontrada = AREAS_JURIDICAS_ADMIN_ASSISTIDO.find(item => item.toLowerCase() === texto)
  if (encontrada) return encontrada
  if (texto.includes("trabalh")) return "Trabalhista"
  if (texto.includes("fam")) return "Família"
  if (texto.includes("banc") || texto.includes("financ") || texto.includes("emprest")) return "Bancário"
  if (texto.includes("consum")) return "Consumidor"
  if (texto.includes("penal") || texto.includes("criminal")) return "Penal"
  if (texto.includes("civil")) return "Civil"
  if (texto.includes("imob") || texto.includes("imóv") || texto.includes("imov")) return "Imobiliário"
  if (texto.includes("inss") || texto.includes("previd")) return "INSS"
  return "Outros"
}

function normalizarStatusCampoAdminAssistido(status, valor) {
  const s = String(status || "").trim().toLowerCase()
  if (STATUS_CAMPO_ADMIN_ASSISTIDO.has(s)) return s
  return valor === null || valor === undefined || String(valor).trim() === ""
    ? "ausente"
    : "inferido"
}

function criarCampoAdminAssistido(valor = null, status = "ausente") {
  const valorNormalizado = valor === undefined ? null : valor
  return {
    valor: valorNormalizado,
    status: normalizarStatusCampoAdminAssistido(status, valorNormalizado)
  }
}

function criarDadosVaziosAdminAssistido() {
  return Object.fromEntries(
    Object.keys(CAMPOS_ADMIN_ASSISTIDO).map(campo => [campo, criarCampoAdminAssistido()])
  )
}

function obterCamposObrigatoriosAdminAssistido(area) {
  const areaNormalizada = normalizarAreaJuridicaAdminAssistido(area)
  return CAMPOS_OBRIGATORIOS_POR_AREA[areaNormalizada] || CAMPOS_OBRIGATORIOS_POR_AREA.Outros
}

function obterCamposRevisaoEspecificosAdminAssistido(area) {
  const areaNormalizada = normalizarAreaJuridicaAdminAssistido(area)
  return CAMPOS_REVISAO_ESPECIFICOS_POR_AREA[areaNormalizada] || CAMPOS_REVISAO_ESPECIFICOS_POR_AREA.Outros
}

function campoAdminAssistidoPreenchido(campo) {
  if (!campo || campo.status === "ausente") return false
  const valor = campo.valor
  if (valor === null || valor === undefined) return false
  return String(valor).trim().length > 0
}

function camposFaltantesAdminAssistido(dados = {}, area = "") {
  const areaNormalizada = normalizarAreaJuridicaAdminAssistido(area || dados.areaJuridica?.valor)
  const obrigatorios = obterCamposObrigatoriosAdminAssistido(areaNormalizada)
  return obrigatorios
    .filter(campo => !campoAdminAssistidoPreenchido(dados[campo]))
    .sort((a, b) =>
      PRIORIDADE_CAMPOS_ADMIN_ASSISTIDO.indexOf(a) - PRIORIDADE_CAMPOS_ADMIN_ASSISTIDO.indexOf(b)
    )
}

function proximoCampoObrigatorioAdminAssistido(dados = {}, area = "") {
  return camposFaltantesAdminAssistido(dados, area)[0] || null
}

function perguntaCampoAdminAssistido(campo) {
  return CAMPOS_ADMIN_ASSISTIDO[campo]?.pergunta || "Qual informação falta para completar o cadastro?"
}

function labelCampoAdminAssistido(campo) {
  return CAMPOS_ADMIN_ASSISTIDO[campo]?.label || campo
}

module.exports = {
  AREAS_JURIDICAS_ADMIN_ASSISTIDO,
  CAMPOS_ADMIN_ASSISTIDO,
  CAMPOS_OBRIGATORIOS_POR_AREA,
  CAMPOS_REVISAO_ESPECIFICOS_POR_AREA,
  PRIORIDADE_CAMPOS_ADMIN_ASSISTIDO,
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido,
  normalizarAreaJuridicaAdminAssistido,
  normalizarStatusCampoAdminAssistido,
  obterCamposObrigatoriosAdminAssistido,
  obterCamposRevisaoEspecificosAdminAssistido,
  campoAdminAssistidoPreenchido,
  camposFaltantesAdminAssistido,
  proximoCampoObrigatorioAdminAssistido,
  perguntaCampoAdminAssistido,
  labelCampoAdminAssistido
}
