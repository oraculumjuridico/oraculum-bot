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
    nome: "caso_atualizacao",
    idioma: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    headerImageUrl: process.env.WHATSAPP_TEMPLATE_TERCEIRO_IMAGEM_URL || "",
    parametrosEsperados: null,
    critico: false
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
