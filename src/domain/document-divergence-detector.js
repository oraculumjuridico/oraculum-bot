const DOCUMENT_DIVERGENCE_DETECTOR_VERSION = "document-divergence-detector-v1"

const CAMPOS_COMPARAVEIS = Object.freeze({
  nome: {
    aliases: ["nome", "nome completo", "nome_completo", "nome civil"],
    gravidade: "ALTA",
    tipo: "identidade"
  },
  cpf: {
    aliases: ["cpf", "cpf do cliente", "cpf_do_cliente"],
    gravidade: "ALTA",
    tipo: "identidade",
    normalizador: normalizarDigitos
  },
  rg: {
    aliases: ["rg", "numero rg", "numero_rg", "registro geral"],
    gravidade: "MEDIA",
    tipo: "identidade",
    normalizador: normalizarAlfanumerico
  },
  dataNascimento: {
    aliases: ["data nascimento", "data_nascimento", "dataNascimento", "nascimento", "data de nascimento"],
    gravidade: "ALTA",
    tipo: "identidade",
    normalizador: normalizarData
  },
  estadoCivil: {
    aliases: ["estado civil", "estado_civil", "estadoCivil"],
    gravidade: "MEDIA",
    tipo: "identidade"
  },
  nomeMae: {
    aliases: ["nome mae", "nome_mae", "nomeMae", "mae", "mae nome"],
    gravidade: "MEDIA",
    tipo: "filiacao"
  },
  nomePai: {
    aliases: ["nome pai", "nome_pai", "nomePai", "pai", "pai nome"],
    gravidade: "MEDIA",
    tipo: "filiacao"
  },
  endereco: {
    aliases: ["endereco", "endereco completo", "logradouro", "rua"],
    gravidade: "MEDIA",
    tipo: "endereco"
  },
  cep: {
    aliases: ["cep"],
    gravidade: "MEDIA",
    tipo: "endereco",
    normalizador: normalizarDigitos
  },
  cidade: {
    aliases: ["cidade", "municipio"],
    gravidade: "MEDIA",
    tipo: "endereco"
  },
  uf: {
    aliases: ["uf", "estado"],
    gravidade: "MEDIA",
    tipo: "endereco",
    normalizador: valor => normalizarTextoComparavel(valor).toUpperCase()
  },
  empresa: {
    aliases: ["empresa", "empregador", "razao social", "razao_social"],
    gravidade: "MEDIA",
    tipo: "trabalhista"
  },
  cargo: {
    aliases: ["cargo", "funcao", "funcao exercida"],
    gravidade: "MEDIA",
    tipo: "trabalhista"
  },
  salario: {
    aliases: ["salario", "salario liquido", "salarioLiquido", "salario bruto", "salarioBruto", "remuneracao"],
    gravidade: "MEDIA",
    tipo: "trabalhista",
    normalizador: normalizarDinheiro
  },
  nb: {
    aliases: ["nb", "numero beneficio", "numero_beneficio", "beneficio"],
    gravidade: "ALTA",
    tipo: "inss",
    normalizador: normalizarAlfanumerico
  },
  der: {
    aliases: ["der", "data entrada requerimento", "data_entrada_requerimento"],
    gravidade: "MEDIA",
    tipo: "inss",
    normalizador: normalizarData
  },
  dib: {
    aliases: ["dib", "data inicio beneficio", "data_inicio_beneficio"],
    gravidade: "MEDIA",
    tipo: "inss",
    normalizador: normalizarData
  },
  numeroProcesso: {
    aliases: ["numero processo", "numero_processo", "processo", "numero", "n processo"],
    gravidade: "ALTA",
    tipo: "processual",
    normalizador: normalizarAlfanumerico
  },
  tribunal: {
    aliases: ["tribunal", "foro"],
    gravidade: "MEDIA",
    tipo: "processual"
  },
  crm: {
    aliases: ["crm", "crm medico", "crm_medico"],
    gravidade: "MEDIA",
    tipo: "medico",
    normalizador: normalizarAlfanumerico
  },
  cid: {
    aliases: ["cid", "cid10", "cid 10"],
    gravidade: "MEDIA",
    tipo: "medico",
    normalizador: normalizarAlfanumerico
  },
  dataDocumento: {
    aliases: ["data", "data documento", "data_documento", "data laudo", "dataLaudo", "data emissao", "dataEmissao"],
    gravidade: "MEDIA",
    tipo: "datas",
    normalizador: normalizarData
  }
})

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function normalizarChave(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizarTextoComparavel(valor = "") {
  return normalizarChave(valor)
}

function normalizarDigitos(valor = "") {
  return String(valor || "").replace(/\D/g, "")
}

function normalizarAlfanumerico(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

function normalizarDinheiro(valor = "") {
  const texto = String(valor || "").trim()
  const br = texto.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/)
  if (br) return br[1].replace(/\./g, "").replace(",", ".")
  const numero = texto.replace(/[^0-9.]/g, "")
  if (!numero) return ""
  const parsed = Number(numero)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : numero
}

function normalizarData(valor = "") {
  const texto = String(valor || "").trim()
  if (!texto) return ""
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3]
    return `${ano.padStart(4, "0")}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
  }
  const data = new Date(texto)
  if (!Number.isNaN(data.getTime())) return data.toISOString().slice(0, 10)
  return normalizarTextoComparavel(texto)
}

function mapaAliases() {
  const mapa = new Map()
  for (const [campo, config] of Object.entries(CAMPOS_COMPARAVEIS)) {
    for (const alias of config.aliases) mapa.set(normalizarChave(alias), campo)
  }
  return mapa
}

const ALIASES = mapaAliases()

function versaoVigente(documento = {}) {
  return normalizarArray(documento.versoes).at(-1) || documento
}

function documentoElegivel(documento = {}) {
  return documento.vigente !== false && documento.status !== "erro"
}

function camposExtraidos(documento = {}) {
  const versao = versaoVigente(documento)
  return versao.extracao?.camposExtraidos || documento.extracao?.camposExtraidos || {}
}

function confiancasExtraidas(documento = {}) {
  const versao = versaoVigente(documento)
  return versao.extracao?.confiancaPorCampo || documento.extracao?.confiancaPorCampo || {}
}

function referenciaDocumento(documento = {}) {
  return {
    registryId: documento.registryId || documento.chaveDocumento || null,
    fileId: documento.fileId || null,
    hash: documento.hash || null,
    nome: documento.nome || null,
    tipoDocumento: documento.tipoDocumento || null
  }
}

function confiancaDoCampo(confiancas = {}, campoOriginal, campoCanonico) {
  const entradas = Object.entries(confiancas)
  const encontrado = entradas.find(([campo]) => normalizarChave(campo) === normalizarChave(campoOriginal)) ||
    entradas.find(([campo]) => ALIASES.get(normalizarChave(campo)) === campoCanonico)
  const valor = Number(encontrado?.[1])
  return Number.isFinite(valor) ? valor : null
}

function normalizarValorCampo(campoCanonico, valor) {
  const config = CAMPOS_COMPARAVEIS[campoCanonico] || {}
  const normalizador = config.normalizador || normalizarTextoComparavel
  return normalizador(valor)
}

function coletarValoresComparaveis(registry = {}) {
  const porCampo = new Map()
  for (const documento of normalizarArray(registry.documentos)) {
    if (!documentoElegivel(documento)) continue
    const campos = camposExtraidos(documento)
    const confiancas = confiancasExtraidas(documento)

    for (const [campoOriginal, valor] of Object.entries(campos)) {
      if (valor === null || valor === undefined || String(valor).trim() === "") continue
      const campoCanonico = ALIASES.get(normalizarChave(campoOriginal))
      if (!campoCanonico) continue
      const valorNormalizado = normalizarValorCampo(campoCanonico, valor)
      if (!valorNormalizado) continue
      if (!porCampo.has(campoCanonico)) porCampo.set(campoCanonico, [])
      porCampo.get(campoCanonico).push({
        campo: campoCanonico,
        campoOriginal,
        valorOriginal: String(valor).trim(),
        valorNormalizado,
        documento: referenciaDocumento(documento),
        confianca: confiancaDoCampo(confiancas, campoOriginal, campoCanonico)
      })
    }
  }
  return porCampo
}

function mesmaFonte(a, b) {
  return a.documento.registryId && a.documento.registryId === b.documento.registryId
}

function assinaturaDivergencia(a, b) {
  return [
    a.campo,
    a.documento.registryId || a.documento.fileId || a.documento.nome,
    b.documento.registryId || b.documento.fileId || b.documento.nome,
    a.valorNormalizado,
    b.valorNormalizado
  ].join("|")
}

function compararCampo(campo, valores = []) {
  const divergencias = []
  const vistas = new Set()
  const config = CAMPOS_COMPARAVEIS[campo] || {}

  for (let i = 0; i < valores.length; i++) {
    for (let j = i + 1; j < valores.length; j++) {
      const valorA = valores[i]
      const valorB = valores[j]
      if (mesmaFonte(valorA, valorB)) continue
      if (valorA.valorNormalizado === valorB.valorNormalizado) continue

      const assinatura = assinaturaDivergencia(valorA, valorB)
      if (vistas.has(assinatura)) continue
      vistas.add(assinatura)

      const confiancas = [valorA.confianca, valorB.confianca].filter(valor => Number.isFinite(valor))
      const confianca = confiancas.length
        ? Number((confiancas.reduce((total, valor) => total + valor, 0) / confiancas.length).toFixed(2))
        : null

      divergencias.push({
        tipo: config.tipo || "documental",
        campo,
        valorA: valorA.valorOriginal,
        documentoA: valorA.documento,
        valorB: valorB.valorOriginal,
        documentoB: valorB.documento,
        gravidade: config.gravidade || "MEDIA",
        confianca,
        observacao: `Valores divergentes para ${campo} em documentos distintos.`
      })
    }
  }

  return divergencias
}

function gerarResumo(divergencias = []) {
  if (!divergencias.length) return "Nenhuma divergencia documental foi encontrada."
  const criticas = divergencias.filter(item => item.gravidade === "ALTA").length
  const medias = divergencias.filter(item => item.gravidade === "MEDIA").length
  const baixas = divergencias.filter(item => item.gravidade === "BAIXA").length
  return [
    `Foram encontradas ${divergencias.length} divergencias.`,
    `${criticas} criticas.`,
    `${medias} medias.`,
    `${baixas} baixas.`,
    criticas ? "Recomenda-se validacao manual." : "Revisao operacional recomendada."
  ].join(" ")
}

function detectarDivergenciasDocumentais(registry = {}) {
  const valores = coletarValoresComparaveis(registry)
  const divergencias = []
  const avisos = []

  for (const [campo, itens] of valores.entries()) {
    if (itens.length < 2) continue
    divergencias.push(...compararCampo(campo, itens))
  }

  if (!normalizarArray(registry.documentos).length) {
    avisos.push({
      code: "DOCUMENT_DIVERGENCE_EMPTY_REGISTRY",
      message: "registry documental vazio; nenhuma comparacao executada"
    })
  } else if (!valores.size) {
    avisos.push({
      code: "DOCUMENT_DIVERGENCE_NO_COMPARABLE_FIELDS",
      message: "nenhum campo comparavel encontrado nos documentos vigentes"
    })
  }

  return {
    versao: DOCUMENT_DIVERGENCE_DETECTOR_VERSION,
    divergencias,
    inconsistenciasCriticas: divergencias.filter(item => item.gravidade === "ALTA"),
    avisos,
    resumo: gerarResumo(divergencias)
  }
}

module.exports = {
  DOCUMENT_DIVERGENCE_DETECTOR_VERSION,
  CAMPOS_COMPARAVEIS,
  detectarDivergenciasDocumentais
}
