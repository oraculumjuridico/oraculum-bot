const assert = require("node:assert/strict")
const { emailValidoHubSpot } = require("../src/domain/hubspot-core")
const { montarUsuarioFinalizacaoAdminAssistido } = require("../src/domain/admin-assisted-ai-flow")
const { montarPropsContatoHubSpot } = require("../src/domain/hubspot-core")

;(async () => {
  let pass = 0
  let fail = 0
  function ok(name) { pass++; console.log(`  ✓ ${name}`) }
  function bad(name, err) { fail++; console.error(`  ✗ ${name}: ${err.message}`) }

  // ============================================================
  // TESTES EXATOS DE VALIDAÇÃO DE E-MAIL
  // ============================================================

  // 1. "email do cliente" é inválido
  try {
    assert.equal(emailValidoHubSpot("email do cliente"), false, "placeholder 'email do cliente' deve ser inválido")
    ok("e-mail placeholder 'email do cliente' é inválido")
  } catch (e) { bad("e-mail placeholder inválido", e) }

  // 2. Placeholder não aparece como confirmado
  try {
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: "email do cliente", status: "inferido" }
      }
    }
    const u = montarUsuarioFinalizacaoAdminAssistido("5581999990000", adminAssistido, {})
    assert.equal(u.email, null, "u.email deve ser null — placeholder nunca gravado")
    ok("placeholder não aparece como confirmado (u.email=null)")
  } catch (e) { bad("placeholder não confirmado", e) }

  // 3. Campo continua pendente
  try {
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: "email do cliente", status: "inferido" }
      }
    }
    const u = montarUsuarioFinalizacaoAdminAssistido("5581999990000", adminAssistido, {})
    assert.equal(u.email, null, "u.email deve estar null (pendente)")
    ok("campo e-mail continua pendente quando placeholder")
  } catch (e) { bad("campo continua pendente", e) }

  // 4. E-mail vazio opcional é aceito
  try {
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" }
        // email ausente — opcional
      }
    }
    const u = montarUsuarioFinalizacaoAdminAssistido("5581999990000", adminAssistido, {})
    assert.equal(u.email, null, "u.email deve ser null quando email ausente")
    ok("e-mail vazio opcional é aceito (u.email = null)")
  } catch (e) { bad("e-mail vazio opcional", e) }

  // 5. E-mail válido é aceito
  try {
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: "maria@example.com", status: "confirmado" }
      }
    }
    const u = montarUsuarioFinalizacaoAdminAssistido("5581999990000", adminAssistido, {})
    assert.equal(u.email, "maria@example.com", "u.email deve conter email válido")
    ok("e-mail válido é aceito e preservado em u.email")
  } catch (e) { bad("e-mail válido aceito", e) }

  // 6. E-mail inválido não chega ao HubSpot
  try {
    const props = montarPropsContatoHubSpot("5581999990000", { email: "email do cliente", nome: "Maria" })
    assert.equal(props.email, undefined, "props.email deve ser omitido quando inválido")
    assert.equal(props.work_email, undefined, "props.work_email deve ser omitido quando inválido")
    ok("e-mail inválido não chega ao HubSpot (props.email omitido)")
  } catch (e) { bad("e-mail inválido no HubSpot", e) }

  // 7. email e work_email omitidos do payload quando ausentes ou inválidos
  try {
    const props = montarPropsContatoHubSpot("5581999990000", { email: "nao-email", nome: "Maria" })
    assert.equal(props.email, undefined, "email deve ser omitido quando inválido")
    assert.equal(props.work_email, undefined, "work_email deve ser omitido quando inválido")
    ok("email e work_email omitidos quando inválidos")
  } catch (e) { bad("email e work_email omitidos", e) }

  try {
    const props = montarPropsContatoHubSpot("5581999990000", { email: undefined, nome: "Maria" })
    assert.equal(props.email, undefined, "email deve ser omitido quando ausente")
    assert.equal(props.work_email, undefined, "work_email deve ser omitido quando ausente")
    ok("email e work_email omitidos quando ausentes")
  } catch (e) { bad("email e work_email ausentes", e) }

  // 8. E-mail válido aparece no payload
  try {
    const props = montarPropsContatoHubSpot("5581999990000", { email: "maria@example.com", nome: "Maria" })
    assert.equal(props.email, "maria@example.com", "email deve conter valor válido")
    assert.equal(props.work_email, "maria@example.com", "work_email deve conter valor válido")
    ok("e-mail válido aparece no payload do HubSpot")
  } catch (e) { bad("e-mail válido no payload", e) }

  // 9. Placeholder com caixa alta é inválido
  try {
    assert.equal(emailValidoHubSpot("EMAIL DO CLIENTE"), false)
    ok("placeholder com caixa alta é inválido")
  } catch (e) { bad("placeholder caixa alta", e) }

  // 10. Email sem @ é inválido
  try {
    assert.equal(emailValidoHubSpot("mariaexample.com"), false)
    ok("email sem @ é inválido")
  } catch (e) { bad("email sem @", e) }

  console.log(`\nemail-validation-blocker.test.js: ${pass} pass, ${fail} fail`)
  if (fail > 0) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
