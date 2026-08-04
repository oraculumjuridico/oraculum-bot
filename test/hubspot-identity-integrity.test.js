const test = require("node:test")
const assert = require("node:assert/strict")
const {
  montarPropsContatoHubSpot,
  montarPropsAusentesContatoHubSpot,
  filtrarPropsHubSpot
} = require("../src/domain/hubspot-core")
const {
  telefoneCanonico,
  definirContatoId,
  definirNegocioId
} = require("../src/domain/identity")

const from = "5511999990000"

for (const valor of ["", null, undefined]) {
  test(`whatsappContato ${String(valor)} não mascara message.from`, () => {
    const props = montarPropsContatoHubSpot(from, { whatsappContato: valor, nome: "Pessoa Teste" })
    assert.equal(props.phone, from)
    assert.equal(props.mobilephone, from)
  })
}

test("telefone válido alimenta phone e mobilephone", () => {
  const props = montarPropsContatoHubSpot(from, { whatsappContato: "(11) 99999-0000" })
  assert.equal(props.phone, from)
  assert.equal(props.mobilephone, from)
})

test("contato sem telefone válido não produz propriedades telefônicas", () => {
  const props = montarPropsContatoHubSpot("", { whatsappContato: "", nome: "Pessoa" })
  assert.equal(props.phone, undefined)
  assert.equal(props.mobilephone, undefined)
})

test("patch nunca inclui telefone vazio e preenche telefone ausente", () => {
  assert.deepEqual(filtrarPropsHubSpot({ phone: "", mobilephone: null }), {})
  const patch = montarPropsAusentesContatoHubSpot(
    { properties: { phone: "", mobilephone: "" } },
    montarPropsContatoHubSpot(from, { nome: "Pessoa" })
  )
  assert.equal(patch.phone, undefined)
  assert.equal(patch.mobilephone, from)
})

test("aliases de identidade permanecem consistentes", () => {
  const u = {}
  definirContatoId(u, "contact-1")
  definirNegocioId(u, "deal-1")
  assert.deepEqual(u, { contatoId: "contact-1", contactId: "contact-1", negocioId: "deal-1", dealId: "deal-1" })
  assert.equal(telefoneCanonico("", null, from), from)
})
