const axios = require("axios")
const {
  sanitizarTextoEntrada,
  normalizarNomeCidadeBusca,
  formatarCidade,
  limparTextoSomenteLetras
} = require("../utils/text")
const { logErro } = require("../utils/logging")

const ESTADOS_EXTENSO = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
  BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins"
}

function estadoPorExtenso(uf) {
  const sigla = String(uf || "").trim().toUpperCase()
  return ESTADOS_EXTENSO[sigla] || uf
}

// Função para buscar informações do CEP usando ViaCEP
async function buscarPorCEP(cep) {
  try {
    // Validar formato do CEP
    const cepLimpo = cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) {
      throw new Error('CEP deve ter 8 dígitos')
    }

    // Consultar API ViaCEP
    const response = await axios.get(`https://viacep.com.br/ws/${cepLimpo}/json/`, {
      timeout: 5000 // 5 segundos de timeout
    })

    const data = response.data

    // Verificar se CEP foi encontrado
    if (data.erro) {
      throw new Error('CEP não encontrado')
    }

    // Extrair informações
    const cidade = data.localidade
    const uf = data.uf
    const regiao = mapearRegiaoPorUF(uf)

    return {
      cidade: cidade,
      uf: uf,
      regiao: regiao,
      cep: cepLimpo
    }

  } catch (error) {
    console.error('[CEP] Erro ao buscar CEP:', error.message)
    throw error
  }
}

// Função para mapear UF para região
function mapearRegiaoPorUF(uf) {
  const regioes = {
    'Norte': ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
    'Nordeste': ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
    'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
    'Sudeste': ['ES', 'MG', 'RJ', 'SP'],
    'Sul': ['PR', 'RS', 'SC']
  }

  for (const [regiao, estados] of Object.entries(regioes)) {
    if (estados.includes(uf)) {
      return regiao
    }
  }

  return 'Sudeste' // fallback
}

async function buscarLocalizacaoGoogleMaps(cidadeLimpa) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return null
  try {
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cidadeLimpa)},Brasil&key=${process.env.GOOGLE_MAPS_API_KEY}`
    const res = await axios.get(geoUrl, { timeout: 7000 })
    const resultado = res.data?.results?.[0]
    if (!resultado) return null

    const componentes = resultado.address_components || []
    const cidade = componentes.find(c => c.types?.includes("administrative_area_level_2") || c.types?.includes("locality"))?.long_name
    const estado = componentes.find(c => c.types?.includes("administrative_area_level_1"))
    if (!cidade && !estado?.short_name) return null

    const uf = estado?.short_name || null
    return {
      cidade: formatarCidade(limparTextoSomenteLetras(cidade || cidadeLimpa)),
      uf,
      estado: estado?.long_name || uf || "",
      regiao: mapearRegiaoPorUF(uf)
    }
  } catch (e) {
    logErro("maps", `Falha geocoding cidade: ${e.response?.status || "sem_status"} ${e.message}`)
    return null
  }
}

let municipiosIBGECache = null
let municipiosIBGECacheTs = 0
const MUNICIPIOS_IBGE_CACHE_MS = 24 * 60 * 60 * 1000

function municipioIBGEParaLocalizacao(m) {
  if (!m) return null
  const uf = m.microrregiao?.mesorregiao?.UF?.sigla || ""
  return {
    cidade: m.nome,
    uf,
    estado: uf,
    regiao: m.microrregiao?.mesorregiao?.UF?.regiao?.nome || mapearRegiaoPorUF(uf)
  }
}

function extrairFiltroUFEstado(texto) {
  const normalizado = normalizarNomeCidadeBusca(texto)
  if (!normalizado) return null
  const tokens = normalizado.split(" ").filter(Boolean)
  const ufs = new Set(Object.keys(ESTADOS_EXTENSO).map(uf => uf.toLowerCase()))
  for (const token of tokens) {
    if (ufs.has(token)) return token.toUpperCase()
  }
  for (const [uf, nome] of Object.entries(ESTADOS_EXTENSO)) {
    if (normalizado.includes(normalizarNomeCidadeBusca(nome))) return uf
  }
  return null
}

function removerFiltroUFEstado(texto) {
  let normalizado = normalizarNomeCidadeBusca(texto)
  const uf = extrairFiltroUFEstado(texto)
  if (!uf) return normalizado
  normalizado = normalizado.replace(new RegExp(`\\b${uf.toLowerCase()}\\b`, "g"), " ")
  normalizado = normalizado.replace(new RegExp(`\\b${normalizarNomeCidadeBusca(ESTADOS_EXTENSO[uf])}\\b`, "g"), " ")
  return normalizado.replace(/\s+/g, " ").trim()
}

function distanciaLevenshtein(a, b) {
  a = normalizarNomeCidadeBusca(a)
  b = normalizarNomeCidadeBusca(b)
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length

  const anterior = Array.from({ length: b.length + 1 }, (_, i) => i)
  const atual = Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    atual[0] = i
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + custo
      )
    }
    for (let j = 0; j <= b.length; j++) anterior[j] = atual[j]
  }
  return anterior[b.length]
}

function scoreMunicipioBusca(entrada, nomeMunicipio) {
  const alvo = normalizarNomeCidadeBusca(nomeMunicipio)
  if (!entrada || !alvo) return Infinity
  if (alvo === entrada) return 0
  if (alvo.startsWith(entrada) || entrada.startsWith(alvo)) return 1
  if (alvo.includes(entrada) || entrada.includes(alvo)) return 2
  return distanciaLevenshtein(entrada, alvo)
}

async function carregarMunicipiosIBGE() {
  const agora = Date.now()
  if (municipiosIBGECache && agora - municipiosIBGECacheTs < MUNICIPIOS_IBGE_CACHE_MS) return municipiosIBGECache

  const res = await axios.get("https://servicodados.ibge.gov.br/api/v1/localidades/municipios", { timeout: 10000 })
  municipiosIBGECache = Array.isArray(res.data) ? res.data : []
  municipiosIBGECacheTs = agora
  return municipiosIBGECache
}

async function buscarCidadePorNomeInteligente(nomeCidade) {
  const entradaOriginal = sanitizarTextoEntrada(nomeCidade)
  const ufFiltro = extrairFiltroUFEstado(entradaOriginal)
  const entrada = removerFiltroUFEstado(entradaOriginal) || normalizarNomeCidadeBusca(entradaOriginal)
  if (entrada.length < 2) return null

  const municipios = await carregarMunicipiosIBGE()
  const candidatosBase = ufFiltro
    ? municipios.filter(m => m.microrregiao?.mesorregiao?.UF?.sigla === ufFiltro)
    : municipios

  const ranqueados = candidatosBase
    .map(m => ({ municipio: m, score: scoreMunicipioBusca(entrada, m.nome) }))
    .filter(item => {
      const alvo = normalizarNomeCidadeBusca(item.municipio.nome)
      const limite = entrada.length <= 5 ? 1 : entrada.length <= 8 ? 2 : 3
      return item.score <= limite || alvo.includes(entrada) || entrada.includes(alvo)
    })
    .sort((a, b) => a.score - b.score || a.municipio.nome.length - b.municipio.nome.length)
    .slice(0, 6)

  if (!ranqueados.length) return null

  const melhores = ranqueados.filter(item => item.score === ranqueados[0].score)
  const opcoes = melhores.map(item => municipioIBGEParaLocalizacao(item.municipio)).filter(Boolean)

  if (opcoes.length === 1) return opcoes[0]
  return { multiplos: true, opcoes }
}

function abreviarCidadeBotao(cidade, uf) {
  const abreviacoes = {
    "Presidente": "Pres.",
    "General": "Gen.",
    "Marechal": "Mar.",
    "Coronel": "Cel.",
    "Doutor": "Dr.",
    "Professora": "Prof.",
    "Professor": "Prof.",
    "Ministro": "Min.",
    "Governador": "Gov.",
    "Deputado": "Dep.",
    "Senador": "Sen.",
    "Nossa Senhora": "N. Sra.",
    "Santo": "Sto.",
    "Santa": "Sta.",
    "São": "S.",
  }
  let nomeAbreviado = cidade
  for (const [palavra, abrev] of Object.entries(abreviacoes)) {
    const regex = new RegExp(`\\b${palavra}\\b`, "gi")
    nomeAbreviado = nomeAbreviado.replace(regex, abrev)
  }
  if (nomeAbreviado.length > 20) {
    nomeAbreviado = nomeAbreviado.substring(0, 18).trimEnd() + "…"
  }
  return `${nomeAbreviado}/${uf}`
}

async function buscarCidadePorNome(nomeCidade) {
  try {
    const nomeLimpo = encodeURIComponent(String(nomeCidade || "").trim())
    const ibgeRes = await axios.get(
      `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${nomeLimpo}`,
      { timeout: 5000 }
    )
    if (ibgeRes.data && ibgeRes.data.length > 0) {
      const nomeNormalizado = nomeCidade.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      const municipiosExatos = ibgeRes.data.filter(m => {
        const nomeM = m.nome.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        return nomeM === nomeNormalizado
      })
      if (!municipiosExatos || municipiosExatos.length === 0) return null
      // Se houver múltiplas cidades com o mesmo nome em estados diferentes, retornar lista
      if (municipiosExatos.length > 1) {
        const opcoes = municipiosExatos.map(m => ({
          cidade: m.nome,
          uf: m.microrregiao.mesorregiao.UF.sigla,
          estado: m.microrregiao.mesorregiao.UF.sigla,
          regiao: m.microrregiao.mesorregiao.UF.regiao.nome
        }))
        return { multiplos: true, opcoes }
      }
      const municipio = municipiosExatos[0]
      const cidade = municipio.nome
      const uf = municipio.microrregiao.mesorregiao.UF.sigla
      const regiao = municipio.microrregiao.mesorregiao.UF.regiao.nome
      return { cidade, uf, estado: uf, regiao }
    }
  } catch (e) {
    logErro("ibge", "buscarCidadePorNome IBGE: " + e.message)
  }

  // AVISO: buscarLocalizacaoGoogleMaps não suporta desambiguação de homônimos.
  // Se o IBGE falhar para uma cidade com múltiplos municípios de mesmo nome,
  // o Maps retornará apenas uma opção automaticamente — sem oferecer lista ao usuário.
  const localizacaoMaps = await buscarLocalizacaoGoogleMaps(nomeCidade)
  if (localizacaoMaps) return localizacaoMaps

  return null
}

module.exports = {
  estadoPorExtenso,
  mapearRegiaoPorUF,
  extrairFiltroUFEstado,
  removerFiltroUFEstado,
  distanciaLevenshtein,
  scoreMunicipioBusca,
  carregarMunicipiosIBGE,
  municipioIBGEParaLocalizacao,
  buscarCidadePorNomeInteligente,
  buscarCidadePorNome,
  buscarLocalizacaoGoogleMaps,
  buscarPorCEP,
  abreviarCidadeBotao
}
