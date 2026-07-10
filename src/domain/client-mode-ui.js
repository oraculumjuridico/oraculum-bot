const {
  createClientScreen,
  gerarAudioDaTela
} = require("./declarative-screen-guard")

function telaModoAtendimento({
  atendente = "",
  boasVindas = false,
  reapresentacao = false
} = {}) {
  const textoAudioBase = boasVindas
    ? `Olá! Meu nome é ${atendente || "a atendente virtual"} e vou acompanhar você neste atendimento. Ao final do cadastro, você poderá falar diretamente com um advogado. A qualquer momento você pode dizer recomeçar ou encerrar se precisar. Como prefere ser atendido durante este processo?`
    : reapresentacao
      ? "Não entendi sua resposta. Como prefere ser atendido durante este processo?"
      : "Como prefere ser atendido durante este processo?"

  const tela = createClientScreen({
    id: "modo_atendimento",
    titulo: "Modo de atendimento",
    texto: `●○○○○○ 📡 *Etapa 1 de 6 · ATENDIMENTO*\n\nComo prefere ser atendido durante este processo?\n\n🎧 *Ouvir e responder:* vou te guiando com perguntas em áudio, uma de cada vez.\n\n✍️ *Ler e digitar:* você vê as perguntas por escrito e responde no seu ritmo.`,
    textoAudioBase,
    acoes: [
      { id: "modo_audio", label: "🎧 Ouvir áudio" },
      { id: "modo_texto", label: "✍️ Ler e digitar" }
    ]
  })

  Object.defineProperty(tela, "audio", {
    enumerable: true,
    get() {
      return gerarAudioDaTela(tela)
    }
  })
  return tela
}

module.exports = {
  telaModoAtendimento
}
