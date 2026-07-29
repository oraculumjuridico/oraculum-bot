const META_TEMPLATES = {
  casoTerceiroAberto: {
    nome: process.env.WHATSAPP_TEMPLATE_TERCEIRO || "",
    idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    headerImageUrl: process.env.WHATSAPP_TEMPLATE_TERCEIRO_IMAGEM_URL || "",
    nomeCatalogo: "caso_terceiro_aberto",
    parametrosEsperados: 4,
    critico: true
  },
  consultaNotificacao: {
    nome: "consulta_notificacao",
    idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    headerImageUrl: "",
    parametrosEsperados: null,
    critico: false
  },
  casoAtualizacao: {
    nome: "caso_atualizacao_v3",
    idioma: "pt_BR",
    status: "APPROVED",
    categoria: "UTILITY",
    headerImageUrl: process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL || "",
    parametrosEsperados: 1,
    componentes: [
      { tipo: "HEADER", formato: "IMAGE", parametros: [{ tipo: "image" }] },
      { tipo: "BODY", parametros: [{ tipo: "text", ordem: 1 }] },
      { tipo: "FOOTER", parametros: [] }
    ],
    exigeContratoComponentes: true,
    contratoVerificado: true,
    critico: true
  },
  retomadaAtendimento: {
    nome: "retomada_atendimento",
    idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    headerImageUrl: "",
    parametrosEsperados: null,
    critico: false
  },
  consultaLembrete24h: {
    nome: "consulta_lembrete_24h",
    idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    headerImageUrl: "",
    parametrosEsperados: null,
    critico: false
  },
  consultaLembreteHoje: {
    nome: "consulta_lembrete_hoje",
    idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    headerImageUrl: "",
    parametrosEsperados: null,
    critico: false
  },
  consultaLembrete1h: {
    nome: "consulta_lembrete_1h",
    idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    headerImageUrl: "",
    parametrosEsperados: null,
    critico: false
  }
}

module.exports = {
  META_TEMPLATES
}
