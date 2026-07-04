async function handle({
  decision,
  u,
  from,
  responderComTimer,
  voltarParaConfirmacao,
  proximaConfirmacaoProgressiva,
  flowAcolhimentoCidade
}) {
  if (decision?.nextAction !== "revalidate_phone_confirm") {
    return { success: false, response: null }
  }

  if (u._corrigindoWhatsappConfirmacao) {
    u.whatsappVerificado = true
    if (!u.whatsappContato) u.whatsappContato = from
    delete u._corrigindoWhatsappConfirmacao
    return {
      success: true,
      response: responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
  }
  if (u._revalidandoCampos) {
    if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
    u._revalidaConfirmados.push("whatsapp")
    return {
      success: true,
      response: await proximaConfirmacaoProgressiva(from, u)
    }
  }
  u.whatsappVerificado = true
  if (!u.whatsappContato) u.whatsappContato = from
  return {
    success: true,
    response: await flowAcolhimentoCidade(u, { from })
  }
}

module.exports = { handle }
