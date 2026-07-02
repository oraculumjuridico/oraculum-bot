async function handle({
  decision,
  u,
  from,
  proximaConfirmacaoProgressiva
}) {
  if (decision?.nextAction !== "revalidate_city_confirm") {
    return { success: false, response: null }
  }

  if (!Array.isArray(u._revalidaConfirmados)) {
    u._revalidaConfirmados = []
  }
  u._revalidaConfirmados.push("cidade")

  return {
    success: true,
    response: await proximaConfirmacaoProgressiva(from, u)
  }
}

module.exports = { handle }
