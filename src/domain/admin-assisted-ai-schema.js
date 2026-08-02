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

const { normalizarNumeroWhatsAppEnvio } = require("./phone-name")
const { normalizeCpfHubSpot } = require("./hubspot-contract")

const STATUS_CAMPO_ADMIN_ASSISTIDO = new Set(["confirmado", "inferido", "ausente", "invalido", "precisa_conferir", "contraditorio"])
const CPF_VERIFICATION = Object.freeze({
  NAO_INFORMADO: "NAO_INFORMADO",
  FORMATO_INVALIDO: "FORMATO_INVALIDO",
  FORMATO_VALIDO_NAO_CONFERIDO: "FORMATO_VALIDO_NAO_CONFERIDO",
  CONFERIDO_COM_DOCUMENTO: "CONFERIDO_COM_DOCUMENTO"
})

// Alinhado com assertFinalizationInvariants (finalization-invariants.js):
// nomeCompleto->nome (minLength 3), cidade->cidade (minLength 2),
// descricao->relato (minLength 3), areaJuridica->area (minLength 2).
// Campos não listados usam minLength=1 (comportamento anterior).
const MIN_LENGTH_POR_CAMPO = {
  nomeCompleto: 3,
  cidade: 2,
  descricao: 3,
  areaJuridica: 2
}

// Placeholders literais que a IA pode extrair incorretamente.
// Estes valores devem ser rejeitados como se fossem dados reais.
const PLACEHOLDERS_INVALIDOS = new Set([
  "nome do cliente",
  "cpf do cliente",
  "data de nascimento do cliente",
  "telefone do cliente",
  "email do cliente",
  "cidade do cliente",
  "uf do cliente",
  "descricao do caso",
  "beneficio solicitado",
  "situacao atual",
  "motivo do pedido",
  "area juridica",
  "tipo de caso",
  "cliente principal",
  "nao informado",
  "nao sei",
  "sem informacao"
])

// Regex para detectar placeholders no formato "X do cliente" / "X do caso"
const REGEX_PLACEHOLDER_CAMPO = /^(nome|cpf|telefone|email|cidade|uf|descricao|beneficio|situacao|motivo|area|tipo|data de nascimento)(\s+(do|da|do caso|do cliente|juridica|cliente))?$/

function valorENormalizadoInvalido(valor, campoNome) {
  if (typeof valor !== "string") return true
  const normalizado = valor.trim().toLowerCase()
  if (!normalizado) return true

  // Rejeitar placeholders literais exatos
  if (PLACEHOLDERS_INVALIDOS.has(normalizado)) return true

  // Rejeitar variações de placeholder (ex: "telefone do cliente", "cpf do cliente")
  if (REGEX_PLACEHOLDER_CAMPO.test(normalizado)) return true

  // Validação de minLength
  const minLength = MIN_LENGTH_POR_CAMPO[campoNome] || 1
  if (normalizado.length < minLength) return true

  // Validação específica por tipo
  switch (campoNome) {
    case "nomeCompleto": {
      const partes = valor.trim().split(/\s+/).filter(Boolean)
      if (partes.length < 2 || partes.some(parte => parte.length < 2)) return true
      break
    }
    case "telefone": {
      const num = normalizarNumeroWhatsAppEnvio(valor)
      const digitos = String(num || "").replace(/\D/g, "")
      if (!digitos.startsWith("55") || digitos.length < 12 || digitos.length > 13) return true
      break
    }
    case "cpf": {
      if (!normalizeCpfHubSpot(valor)) return true
      break
    }
    case "idade": {
      const idade = Number(String(valor).replace(/\D/g, ""))
      if (!Number.isInteger(idade) || idade < 0 || idade > 130) return true
      break
    }
    case "dataNascimento": {
      const ddmmaaaa = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      const yyyymmdd = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (ddmmaaaa) {
        const [, d, m, a] = ddmmaaaa.map(Number)
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 1900 && a <= new Date().getFullYear())) return true
      } else if (yyyymmdd) {
        const [, a, m, d] = yyyymmdd.map(Number)
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 1900 && a <= new Date().getFullYear())) return true
      } else {
        return true
      }
      break
    }
    case "uf": {
      if (!/^[A-Z]{2}$/i.test(valor.trim())) return true
      break
    }
    case "email": {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(valor.trim())) return true
      break
    }
  }

  return false
}

function campoAdminAssistidoPreenchido(campo, campoNome) {
  if (!campo || ["ausente", "invalido", "precisa_conferir", "contraditorio"].includes(campo.status)) return false
  const valor = campo.valor
  if (valor === null || valor === undefined) return false
  return !valorENormalizadoInvalido(String(valor), campoNome)
}

const CAMPOS_ADMIN_ASSISTIDO = {
  nomeCompleto: {
    label: "Nome completo",
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
  idade: {
    label: "Idade",
    pergunta: "Qual é a idade informada? Não estime a data de nascimento."
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
  estadoCivil: { label: "Estado civil", pergunta: "Qual é o estado civil informado?" },
  profissao: { label: "Profissão", pergunta: "Qual é a profissão informada?" },
  situacaoProfissional: { label: "Situação profissional", pergunta: "Qual é a situação profissional atual?" },
  endereco: { label: "Endereço", pergunta: "Qual é o endereço atual?" },
  numeroEndereco: { label: "Número", pergunta: "Qual é o número do endereço?" },
  complementoEndereco: { label: "Complemento", pergunta: "Há complemento no endereço?" },
  bairro: { label: "Bairro", pergunta: "Qual é o bairro?" },
  cep: { label: "CEP", pergunta: "Qual é o CEP?" },
  apelido: { label: "Apelido", pergunta: "Há nome social ou apelido relevante?" },
  conflitoInteresses: { label: "Conflito de interesses", pergunta: "Existe conflito de interesses conhecido?" },
  acidenteTrabalho: { label: "Acidente de trabalho", pergunta: "Houve acidente de trabalho?" },
  limitacoesAtuais: { label: "Limitações atuais", pergunta: "Quais limitações atuais foram informadas?" },
  atividadeHabitual: { label: "Atividade habitual", pergunta: "Qual era a atividade profissional habitual?" },
  composicaoFamiliar: { label: "Composição familiar", pergunta: "Qual é a composição familiar informada?" },
  rendaAtual: { label: "Renda atual", pergunta: "Qual é a renda atual informada?" },
  beneficioAnterior: { label: "Benefício anterior", pergunta: "Houve benefício anterior?" },
  dataRequerimento: { label: "Data do requerimento", pergunta: "Qual é a data exata do requerimento?" },
  resultadoPericia: { label: "Resultado da perícia", pergunta: "Qual foi o resultado informado da perícia?" },
  documentosMedicos: { label: "Documentos médicos", pergunta: "Quais documentos médicos estão disponíveis?" },
  motivoEncerramentoVinculo: { label: "Encerramento do vínculo", pergunta: "Qual foi o motivo do encerramento do vínculo?" },
  naturezaDemanda: { label: "Natureza da demanda", pergunta: "Qual é a natureza específica da demanda?" },
  orgao: { label: "Órgão", pergunta: "Qual órgão ou entidade está envolvido?" },
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
  Outros: [...OBRIGATORIOS_BASE]
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
   if (texto.includes("inss") || texto.includes("previd")) return "INSS"
   if (texto.includes("trabalh")) return "Trabalhista"
   if (texto.includes("fam")) return "Família"
   if (texto.includes("banc") || texto.includes("financ") || texto.includes("emprest")) return "Bancário"
   if (texto.includes("consum")) return "Consumidor"
   if (texto.includes("penal") || texto.includes("criminal")) return "Penal"
   if (texto.includes("civil")) return "Civil"
   if (texto.includes("imob") || texto.includes("imóv") || texto.includes("imov")) return "Imobiliário"
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

function criarCampoCpfAdminAssistido(valor = null, status = "ausente", verificacao = null) {
  const informado = valor !== null && valor !== undefined && String(valor).trim() !== ""
  if (!informado) return { valor: null, status: "ausente", verificacao: CPF_VERIFICATION.NAO_INFORMADO }
  const canonico = normalizeCpfHubSpot(String(valor))
  if (!canonico) return { valor: String(valor).trim(), status: "invalido", verificacao: CPF_VERIFICATION.FORMATO_INVALIDO }
  const conferido = verificacao === CPF_VERIFICATION.CONFERIDO_COM_DOCUMENTO
  return {
    valor: canonico,
    status: conferido ? "confirmado" : normalizarStatusCampoAdminAssistido(status, canonico),
    verificacao: conferido ? CPF_VERIFICATION.CONFERIDO_COM_DOCUMENTO : CPF_VERIFICATION.FORMATO_VALIDO_NAO_CONFERIDO
  }
}

function normalizarCampoAdminAssistido(campo, valor, status = "inferido") {
  if (campo === "cpf") return criarCampoCpfAdminAssistido(valor, status)
  if (campo === "idade" && valor !== null && valor !== undefined) {
    const idade = Number(String(valor).replace(/\D/g, ""))
    return Number.isInteger(idade) && idade >= 0 && idade <= 130
      ? criarCampoAdminAssistido(idade, status)
      : { valor, status: "invalido" }
  }
  return criarCampoAdminAssistido(valor, status)
}

function criarDadosVaziosAdminAssistido() {
  return Object.fromEntries(
    Object.keys(CAMPOS_ADMIN_ASSISTIDO).map(campo => [
      campo,
      campo === "cpf" ? criarCampoCpfAdminAssistido() : criarCampoAdminAssistido()
    ])
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

function camposFaltantesAdminAssistido(dados = {}, area = "") {
  const areaNormalizada = normalizarAreaJuridicaAdminAssistido(area || dados.areaJuridica?.valor)
  const obrigatorios = obterCamposObrigatoriosAdminAssistido(areaNormalizada)
  return obrigatorios
    .filter(campo => !campoAdminAssistidoPreenchido(dados[campo], campo))
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
  valorENormalizadoInvalido,
  proximoCampoObrigatorioAdminAssistido,
  perguntaCampoAdminAssistido,
  labelCampoAdminAssistido,
  PLACEHOLDERS_INVALIDOS,
  CPF_VERIFICATION,
  criarCampoCpfAdminAssistido,
  normalizarCampoAdminAssistido
}
