function normalizarAcoes(acoes = []) {
  if (!Array.isArray(acoes)) return []

  return acoes
    .filter(Boolean)
    .map((acao, index) => {
      const textoAudio = String(acao.textoAudio || "").trim()
      return {
        id: acao.id || `acao_${index}`,
        label: String(acao.label || "").trim(),
        ...(textoAudio ? { textoAudio } : {})
      }
    })
    .filter(acao => acao.label)
}

function criarTela({
  id,
  titulo,
  texto,
  textoAudioBase,
  acoes = [],
  imagemUrl = null
} = {}) {
  const tela = {
    id: id || "",
    titulo: titulo || "",
    texto: String(texto || "").trim(),
    textoAudioBase: String(textoAudioBase || "").trim(),
    acoes: normalizarAcoes(acoes),
    imagemUrl
  }
  Object.defineProperty(tela, "opcoes", {
    enumerable: true,
    get() {
      return gerarBotoesDaTela(this)
    }
  })
  return tela
}

function gerarBotoesDaTela(tela = {}) {
  return (tela.acoes || []).map(acao => ({
    id: acao.id,
    title: acao.label
  }))
}

function gerarAudioDaTela(tela = {}) {
  const textoBase = String(tela.textoAudioBase || "").trim().replace(/[.\s]+$/, "")
  const orientacoes = (tela.acoes || [])
    .map(acao => acao.textoAudio
      ? acao.textoAudio.replace(/[.\s]+$/, "")
      : `Para ${acao.label}, toque em ${acao.label}`)
    .join(". ")

  if (!textoBase) return orientacoes ? `${orientacoes}.` : ""
  if (!orientacoes) return `${textoBase}.`
  return `${textoBase}. ${orientacoes}.`
}

module.exports = {
  criarTela,
  gerarBotoesDaTela,
  gerarAudioDaTela
}
