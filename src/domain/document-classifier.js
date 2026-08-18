const CATEGORIAS_DOCUMENTAIS = Object.freeze({
  PESSOAL: "documentos_pessoais",
  TRABALHISTA: "trabalhista",
  PREVIDENCIARIO: "previdenciario",
  MEDICO: "medico",
  PROCESSUAL: "processual",
  SOCIAL: "cadastro_social",
  OUTROS: "outros"
})

const DOCUMENTO_DESCONHECIDO = Object.freeze({
  id: "documento_desconhecido",
  tipoDocumento: "Documento desconhecido",
  categoria: CATEGORIAS_DOCUMENTAIS.OUTROS,
  subtipo: null,
  fortes: [],
  apoio: []
})

const TIPOS_DOCUMENTAIS = Object.freeze([
  {
    id: "rg_frente",
    tipoDocumento: "RG frente",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "identidade",
    fortes: ["registro geral", "carteira de identidade", "republica federativa do brasil"],
    apoio: ["nome", "data de nascimento", "filiacao", "naturalidade", "doc origem", "identidade"]
  },
  {
    id: "rg_verso",
    tipoDocumento: "RG verso",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "identidade",
    fortes: [
      "assinatura do titular", "polegar direito", "via de identidade", "lei 7116",
      "valida em todo o territorio nacional", "valida em todo territorio nacional",
      "assinatura do diretor", "data de expedicao", "secretaria de seguranca publica"
    ],
    apoio: [
      "registro geral", "carteira de identidade", "orgao expedidor",
      "instituto de identificacao", "secretaria de seguranca"
    ]
  },
  {
    id: "cpf",
    tipoDocumento: "CPF",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "cadastro_pessoa_fisica",
    fortes: ["cadastro de pessoas fisicas", "comprovante de inscricao no cpf", "cpf"],
    apoio: ["receita federal", "numero de inscricao", "situacao cadastral", "regular"]
  },
  {
    id: "cnh",
    tipoDocumento: "CNH",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "habilitacao",
    fortes: ["carteira nacional de habilitacao", "permissao para dirigir", "cnh"],
    apoio: ["renach", "categoria", "validade", "detran", "habilitacao"]
  },
  {
    id: "ctps",
    tipoDocumento: "CTPS",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "carteira_trabalho",
    fortes: ["carteira de trabalho", "previdencia social", "ctps"],
    apoio: ["contrato de trabalho", "pis", "serie", "empregador", "admissao"]
  },
  {
    id: "certidao_nascimento",
    tipoDocumento: "Certidao de nascimento",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "registro_civil",
    fortes: ["certidao de nascimento", "nascimento"],
    apoio: ["registro civil", "nascido", "genitores", "livro", "folha", "termo"]
  },
  {
    id: "certidao_casamento",
    tipoDocumento: "Certidao de casamento",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "registro_civil",
    fortes: ["certidao de casamento", "casamento"],
    apoio: ["registro civil", "conjuge", "nubentes", "regime de bens", "matrimonio"]
  },
  {
    id: "comprovante_residencia",
    tipoDocumento: "Comprovante de residencia",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "endereco",
    fortes: ["comprovante de residencia", "conta de energia", "conta de agua", "fatura de telefone"],
    apoio: ["endereco", "cep", "vencimento", "consumo", "unidade consumidora", "titular"]
  },
  {
    id: "holerite",
    tipoDocumento: "Holerite",
    categoria: CATEGORIAS_DOCUMENTAIS.TRABALHISTA,
    subtipo: "remuneracao",
    fortes: ["holerite", "contracheque", "recibo de pagamento de salario"],
    apoio: ["salario base", "proventos", "descontos", "liquido a receber", "competencia"]
  },
  {
    id: "trct",
    tipoDocumento: "TRCT",
    categoria: CATEGORIAS_DOCUMENTAIS.TRABALHISTA,
    subtipo: "rescisao",
    fortes: ["termo de rescisao do contrato de trabalho", "trct", "rescisao do contrato de trabalho"],
    apoio: ["verbas rescisorias", "data do afastamento", "aviso previo", "homologacao"]
  },
  {
    id: "contrato_trabalho",
    tipoDocumento: "Contrato de trabalho",
    categoria: CATEGORIAS_DOCUMENTAIS.TRABALHISTA,
    subtipo: "contrato",
    fortes: ["contrato de trabalho", "contrato individual de trabalho"],
    apoio: ["empregador", "empregado", "jornada", "salario", "admissao", "clausula"]
  },
  {
    id: "extrato_fgts",
    tipoDocumento: "Extrato FGTS",
    categoria: CATEGORIAS_DOCUMENTAIS.TRABALHISTA,
    subtipo: "fgts",
    fortes: ["extrato fgts", "fundo de garantia do tempo de servico", "fgts"],
    apoio: ["caixa economica federal", "deposito", "saldo", "conta vinculada", "pis"]
  },
  {
    id: "cnis",
    tipoDocumento: "CNIS",
    categoria: CATEGORIAS_DOCUMENTAIS.PREVIDENCIARIO,
    subtipo: "extrato_contribuicoes",
    fortes: ["cadastro nacional de informacoes sociais", "cnis", "extrato previdenciario"],
    apoio: ["meu inss", "nit", "vinculos", "remuneracoes", "contribuicoes", "competencia"]
  },
  {
    id: "carta_inss",
    tipoDocumento: "Carta do INSS",
    categoria: CATEGORIAS_DOCUMENTAIS.PREVIDENCIARIO,
    subtipo: "comunicacao",
    fortes: ["instituto nacional do seguro social", "carta do inss"],
    apoio: ["inss", "beneficio", "requerimento", "agencia da previdencia social", "segurado"]
  },
  {
    id: "indeferimento",
    tipoDocumento: "Indeferimento",
    categoria: CATEGORIAS_DOCUMENTAIS.PREVIDENCIARIO,
    subtipo: "negativa",
    fortes: ["indeferimento", "pedido indeferido", "beneficio indeferido"],
    apoio: ["inss", "nao reconhecimento", "motivo do indeferimento", "recurso", "decisao administrativa"]
  },
  {
    id: "comunicacao_decisao",
    tipoDocumento: "Comunicacao de decisao",
    categoria: CATEGORIAS_DOCUMENTAIS.PREVIDENCIARIO,
    subtipo: "decisao_administrativa",
    fortes: ["comunicacao de decisao", "comunicado de decisao"],
    apoio: ["inss", "resultado", "requerimento", "beneficio", "data da decisao"]
  },
  {
    id: "laudo",
    tipoDocumento: "Laudo",
    categoria: CATEGORIAS_DOCUMENTAIS.MEDICO,
    subtipo: "laudo_medico",
    fortes: ["laudo medico", "laudo"],
    apoio: ["diagnostico", "cid", "crm", "medico", "exame clinico", "conclusao"]
  },
  {
    id: "exame",
    tipoDocumento: "Exame",
    categoria: CATEGORIAS_DOCUMENTAIS.MEDICO,
    subtipo: "resultado_exame",
    fortes: ["resultado de exame", "exame"],
    apoio: ["laboratorio", "material", "referencia", "resultado", "imagem", "ressonancia", "ultrassom"]
  },
  {
    id: "receita",
    tipoDocumento: "Receita",
    categoria: CATEGORIAS_DOCUMENTAIS.MEDICO,
    subtipo: "prescricao",
    fortes: ["receita medica", "prescricao medica", "prescricao"],
    apoio: ["uso oral", "tomar", "medicamento", "posologia", "crm", "paciente"]
  },
  {
    id: "atestado",
    tipoDocumento: "Atestado",
    categoria: CATEGORIAS_DOCUMENTAIS.MEDICO,
    subtipo: "afastamento",
    fortes: ["atestado medico", "atesto para os devidos fins", "atestado"],
    apoio: ["afastamento", "dias", "cid", "crm", "paciente", "repouso"]
  },
  {
    id: "cadastro_unico_cras",
    tipoDocumento: "Comprovante de atualizacao do Cadastro Unico CRAS",
    categoria: CATEGORIAS_DOCUMENTAIS.SOCIAL,
    subtipo: "cadastro_unico_cras",
    fortes: ["cadastro unico", "cadunico", "centro de referencia de assistencia social", "cras"],
    apoio: ["nis", "codigo familiar", "responsavel familiar", "data da atualizacao", "programas sociais", "folha resumo"]
  },
  {
    id: "peticao",
    tipoDocumento: "Peticao",
    categoria: CATEGORIAS_DOCUMENTAIS.PROCESSUAL,
    subtipo: "peca_processual",
    fortes: ["peticao inicial", "peticao", "excelentissimo senhor doutor juiz"],
    apoio: ["autos", "processo", "requer", "advogado", "oab", "vara"]
  },
  {
    id: "sentenca",
    tipoDocumento: "Sentenca",
    categoria: CATEGORIAS_DOCUMENTAIS.PROCESSUAL,
    subtipo: "ato_judicial",
    fortes: ["sentenca", "julgo procedente", "julgo improcedente"],
    apoio: ["dispositivo", "fundamentacao", "relatorio", "condeno", "custas"]
  },
  {
    id: "decisao",
    tipoDocumento: "Decisao",
    categoria: CATEGORIAS_DOCUMENTAIS.PROCESSUAL,
    subtipo: "ato_judicial",
    fortes: ["decisao", "decisao interlocutoria", "defiro", "indefiro"],
    apoio: ["processo", "intime-se", "cumpra-se", "vara", "juiz"]
  },
  {
    id: "andamento",
    tipoDocumento: "Andamento",
    categoria: CATEGORIAS_DOCUMENTAIS.PROCESSUAL,
    subtipo: "movimentacao_processual",
    fortes: ["andamento processual", "movimentacao processual", "consulta processual"],
    apoio: ["processo", "distribuido", "conclusos", "juntada", "publicado", "tribunal"]
  }
])

function normalizarTextoClassificacao(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizarQuantidadePaginas(quantidadePaginas) {
  const parsed = Number(quantidadePaginas)
  if (!Number.isFinite(parsed) || parsed < 1) return 0
  return Math.floor(parsed)
}

function normalizarMetadadosImagem(metadadosImagem = {}) {
  if (!metadadosImagem || typeof metadadosImagem !== "object") return {}
  return { ...metadadosImagem }
}

function contarOcorrenciasTermo(texto, termo) {
  const termoNormalizado = normalizarTextoClassificacao(termo)
  if (!texto || !termoNormalizado) return 0
  let count = 0
  let cursor = 0
  while (true) {
    const index = texto.indexOf(termoNormalizado, cursor)
    if (index === -1) break
    count += 1
    cursor = index + termoNormalizado.length
  }
  return count
}

function pontuarTermos(texto, termos, peso) {
  const encontrados = []
  let score = 0

  for (const termo of termos) {
    const ocorrencias = contarOcorrenciasTermo(texto, termo)
    if (ocorrencias > 0) {
      encontrados.push(termo)
      score += peso + Math.min(ocorrencias - 1, 2)
    }
  }

  return { score, encontrados }
}

function calcularBonusContexto(tipo, contexto) {
  const bonus = []
  let score = 0

  if (contexto.quantidadePaginas > 1 && [
    "trct",
    "contrato_trabalho",
    "cnis",
    "peticao",
    "sentenca",
    "andamento"
  ].includes(tipo.id)) {
    score += 1
    bonus.push("documento com multiplas paginas")
  }

  const mimeType = normalizarTextoClassificacao(contexto.metadadosImagem.mimeType || contexto.metadadosImagem.mimetype)
  if (mimeType.includes("png") || mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    score += 0.25
    bonus.push("metadado de imagem compativel")
  }

  return { score, bonus }
}

function calcularCandidato(tipo, contexto) {
  const fortes = pontuarTermos(contexto.textoNormalizado, tipo.fortes, 6)
  const apoio = pontuarTermos(contexto.textoNormalizado, tipo.apoio, 2)
  const bonus = calcularBonusContexto(tipo, contexto)
  const score = fortes.score + apoio.score + bonus.score
  const sinais = [...fortes.encontrados, ...apoio.encontrados, ...bonus.bonus]

  return {
    tipoDocumento: tipo.tipoDocumento,
    categoria: tipo.categoria,
    subtipo: tipo.subtipo,
    confianca: 0,
    justificativa: sinais.length
      ? `Sinais encontrados: ${sinais.slice(0, 6).join(", ")}.`
      : "Nenhum sinal documental relevante encontrado.",
    score
  }
}

function calcularConfianca(score, melhorScore) {
  if (score <= 0 || melhorScore <= 0) return 0
  const absoluta = Math.min(score / 18, 1)
  const relativa = Math.min(score / melhorScore, 1)
  return Number(((absoluta * 0.75) + (relativa * 0.25)).toFixed(2))
}

function montarCandidatoDesconhecido(motivo = "Texto insuficiente ou sem marcadores documentais especificos.") {
  return {
    tipoDocumento: DOCUMENTO_DESCONHECIDO.tipoDocumento,
    categoria: DOCUMENTO_DESCONHECIDO.categoria,
    subtipo: DOCUMENTO_DESCONHECIDO.subtipo,
    confianca: 0.2,
    justificativa: motivo
  }
}

function classificarDocumento(input = {}) {
  const textoOCR = typeof input === "string" ? input : input.textoOCR
  const metadadosImagem = normalizarMetadadosImagem(input.metadadosImagem || input.metadata || input.metadados)
  const quantidadePaginas = normalizarQuantidadePaginas(input.quantidadePaginas || input.paginas || input.pages)
  const textoNormalizado = normalizarTextoClassificacao(textoOCR)

  const contexto = {
    textoNormalizado,
    metadadosImagem,
    quantidadePaginas
  }

  if (!textoNormalizado) {
    const desconhecido = montarCandidatoDesconhecido("Texto OCR ausente ou vazio.")
    return {
      ...desconhecido,
      candidatos: [desconhecido]
    }
  }

  const candidatosPontuados = TIPOS_DOCUMENTAIS
    .map(tipo => calcularCandidato(tipo, contexto))
    .sort((a, b) => b.score - a.score || a.tipoDocumento.localeCompare(b.tipoDocumento))

  const melhorScore = candidatosPontuados[0]?.score || 0
  const candidatos = candidatosPontuados
    .filter(candidato => candidato.score > 0)
    .map(({ score, ...candidato }) => ({
      ...candidato,
      confianca: calcularConfianca(score, melhorScore)
    }))

  if (!candidatos.length || melhorScore < 4) {
    const desconhecido = montarCandidatoDesconhecido()
    return {
      ...desconhecido,
      candidatos: [desconhecido, ...candidatos].slice(0, 5)
    }
  }

  const principal = candidatos[0]
  return {
    tipoDocumento: principal.tipoDocumento,
    categoria: principal.categoria,
    subtipo: principal.subtipo,
    confianca: principal.confianca,
    justificativa: principal.justificativa,
    candidatos: candidatos.slice(0, 5)
  }
}

module.exports = {
  CATEGORIAS_DOCUMENTAIS,
  TIPOS_DOCUMENTAIS,
  classificarDocumento
}
