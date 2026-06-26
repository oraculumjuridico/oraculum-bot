const {
  normalizarStageKey,
  normalizarTextoGatilho,
  sanitizarTextoEntrada
} = require("../utils/text")

function calcScore(u) {
  let s = 0
  if (u.urgencia === "alta") s += 3
  if (u.semReceber) s += 3
  if (u.situacao === "cortado") s += 2
  if (u.situacao === "negado") s += 1
  if (u.documentosEnviados) s += 2
  return s
}

function scoreEmocional(u = {}) {
  const relato = normalizarTextoGatilho([
    u.descricao,
    u._audioCanalTranscricao,
    u.assuntoResumo,
    u.detalhe,
    u.situacao
  ].filter(Boolean).join(" "))
  const fatores = []
  let score = 0

  const adicionar = (condicao, pontos, fator) => {
    if (!condicao) return
    score += pontos
    fatores.push(fator)
  }

  adicionar(u.urgencia === "alta", 3, "urgencia_alta")
  adicionar(Boolean(u.semReceber), 2, "sem_receber")
  adicionar(/\b(desesperad|desespero|ansiedad|medo|ameac|ameaca|perigo|risco|violencia)\b/.test(relato), 2, "sofrimento_relato")
  adicionar(/\b(hoje|amanha|prazo|intimad|audiencia|liminar|urgente|urgencia)\b/.test(relato), 2, "prazo_ou_urgencia")
  adicionar(/\b(cortad|bloquead|suspend|negad|sem renda|sem dinheiro|aluguel atrasado|despejo)\b/.test(relato), 1, "impacto_financeiro")
  adicionar(/\b(crianca|filho|filha|idoso|idosa|doenca|deficiencia)\b/.test(relato), 1, "vulnerabilidade")

  const valor = Math.max(0, Math.min(10, score))
  const nivel = valor >= 7 ? "alto" : valor >= 4 ? "medio" : "baixo"
  return { valor, nivel, fatores }
}

/**
 * Temperatura do lead:
 * ⚪ Frio  — entrou mas não preencheu informações (sem nome confirmado + sem cidade)
 * 🟡 Morno — confirmou nome e chegou até cidade/região
 * 🟢 Quente — preencheu todos os dados mas ainda não confirmou o cadastro
 */
function definirTemperatura(u) {
  const stage = normalizarStageKey(u?.stage)

  // Quente: na tela de confirmação final ou tem todos os campos-chave
  const stagesQuentes = new Set(["confirmacao", "menu_correcao", "corrigir_valor", "corrigir_uf", "corrigir_sel", "confirmar_correcao", "audio_confirmar_dados", "corrigir_dados", "editar_nome", "editar_cidade", "editar_area", "editar_situacao", "editar_detalhe", "editar_urgencia", "editar_descricao", "confirmar_correcao_nome", "confirmar_correcao_cidade"])
  if (stagesQuentes.has(stage)) return "quente"
  if (u?.nomeConfirmado && u?.cidade && u?.area && (u?.contribuicao || u?.descricao)) return "quente"

  // Morno: confirmou nome e tem cidade/região
  if (u?.nomeConfirmado && (u?.cidade || u?.uf || u?.regiao)) return "morno"
  if (u?.nomeConfirmado && u?.area) return "morno"
  if (u?.area && (u?.situacao || u?.descricao)) return "morno"

  // Frio: não chegou a preencher dados básicos
  return "frio"
}

function getTemperaturaLeadHubSpot(u) {
  const stage = normalizarStageKey(u?.stage)
  const stagesQuentes = new Set([
    "confirmacao",
    "menu_correcao",
    "corrigir_valor",
    "corrigir_uf",
    "corrigir_sel",
    "confirmar_correcao",
    "confirmar_entrada",
    "coleta_nome",
    "coleta_regiao",
    "coleta_uf",
    "coleta_cidade",
    "coleta_cidade_regiao",
    "coleta_contrib",
    "coleta_contrib_regiao",
    "coleta_contrib_regiao_v2",
    "coleta_benef",
    "__coleta_benef_regiao_v2__",
    "__coleta_nome_legado__",
    "__coleta_cidade_legado__",
    "__coleta_regiao_legado__",
    "__coleta_uf_legado__",
    "coleta_verif_tel",
    "coleta_tel_outro",
    "coleta_tel_wpp",
    "coleta_tel_wpp_contato",
    "novo_caso_confirma",
    "confirmar_correcao_nome",
    "confirmar_correcao_cidade"
  ])
  const stagesMornos = new Set([
    "descricao_caso",
    "coleta_desc",
    "coleta_desc_audio",
    "desc_confirma",
    "desc_erro_transcricao",
    "sugestao_fluxo_outro",
    "explicar_tudo_oferta",
    "trab_out_desc",
    "out_desc",
    "area",
    "inss_menu",
    "inss_novo",
    "inss_neg_tipo",
    "inss_cort_tipo",
    "inss_apos",
    "inss_bpc",
    "inss_inc",
    "inss_dep",
    "inss_out",
    "inss_ja",
    "inss_neg_quando",
    "inss_cort_mot",
    "inss_cort_rec",
    "inss_cort_qdo",
    "trab_menu",
    "trab_dem_tipo",
    "trab_dem_verb",
    "trab_dem_qdo",
    "trab_dir_tipo",
    "trab_dir_pend",
    "trab_acid_af",
    "trab_ass_s",
    "trab_ass_prov",
    "outros_menu",
    "out_cons_tipo",
    "out_rev_tipo",
    "gatilho",
    "urgencia"
  ])

  if (stagesQuentes.has(stage)) return "quente"
  if (stagesMornos.has(stage)) return "morno"
  return "frio"
}

function mapearTemperatura(temp) {
  const mapa = {
    frio: "Frio",
    morno: "Morno",
    quente: "Quente",
  }
  return mapa[temp] || "Frio"
}

function mapearPrioridade(temp) {
  const mapa = {
    frio: "low",
    morno: "medium",
    quente: "high",
  }
  return mapa[temp] || "low"
}

function mapearTipoCaso(u) {
  if (!u.area || !u.tipo) return null

  const areaMap = {
    area_inss: "inss",
    area_trab: "trab",
    area_familia: "familia",
    area_consumidor: "consumidor",
    area_penal: "penal",
    area_civil: "civil",
    area_imovel: "imovel",
    area_outros: "outros",
    inss: "inss",
    trabalhista: "trab",
    outros: "outros",
  }

  const tipoMap = {
    aposentadoria: "aposentadoria",
    bpc: "bpc",
    incapacidade: "incapacidade",
    dependentes: "dependentes",
    inss_outros: "outros",

    demissao: "demissao",
    direitos: "direitos",
    acidente: "acidente",
    assedio: "assedio",
    outros: "outros",

    revisao: "revisao",
  }

  const areaNormalizada = (() => {
    const area = sanitizarTextoEntrada(u.area).toLowerCase()
    if (area === "inss") return "inss"
    if (area === "trabalhista") return "trabalhista"
    if (area === "outros") return "outros"
    return area
  })()
  const area = areaMap[areaNormalizada]
  const tipo = tipoMap[sanitizarTextoEntrada(u.tipo).toLowerCase()]

  if (!area || !tipo) return null

  return `${area}_${tipo}`
}

module.exports = {
  calcScore,
  scoreEmocional,
  definirTemperatura,
  getTemperaturaLeadHubSpot,
  mapearTemperatura,
  mapearPrioridade,
  mapearTipoCaso
}
