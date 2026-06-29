function normalizarAcoes(acoes = []) {
  if (!Array.isArray(acoes)) return []

  return acoes
    .filter(Boolean)
    .map((acao, index) => ({
      id: acao.id || `acao_${index}`,
      label: String(acao.label || "").trim()
    }))
    .filter(acao => acao.label)
}

function criarTela({
  id,
  titulo,
  textoAudioBase,
  acoes = []
} = {}) {
  return {
    id: id || "",
    titulo: titulo || "",
    textoAudioBase: String(textoAudioBase || "").trim(),
    acoes: normalizarAcoes(acoes)
  }
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
    .map(acao => `Para ${acao.label}, toque em ${acao.label}`)
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
