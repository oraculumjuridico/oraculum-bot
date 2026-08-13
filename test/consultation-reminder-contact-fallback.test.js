"use strict"

const assert = require("node:assert/strict")
const {
  resolveConsultationReminderContact
} = require("../src/domain/consultation-reminder-contact-resolver")

function httpError(status) {
  return Object.assign(new Error(`HTTP_${status}`), { response: { status } })
}

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

;(async () => {
  await test("preserva caminho normal sem consultar o deal", async () => {
    let associationCalls = 0
    const result = await resolveConsultationReminderContact({
      contactId: "contact-current",
      dealId: "deal-1",
      getContact: async id => ({ id, properties: { phone: "5511999999999" } }),
      listDealContacts: async () => { associationCalls += 1; return [] }
    })
    assert.equal(result.ok, true)
    assert.equal(result.contact.id, "contact-current")
    assert.equal(result.fallbackByDeal, false)
    assert.equal(associationCalls, 0)
  })

  await test("resolve contactId obsoleto pelo unico contato do deal", async () => {
    const requested = []
    const result = await resolveConsultationReminderContact({
      contactId: "contact-stale",
      dealId: "deal-1",
      getContact: async id => {
        requested.push(id)
        if (id === "contact-stale") throw httpError(404)
        return { id, properties: { phone: "5511999999999" } }
      },
      listDealContacts: async id => {
        assert.equal(id, "deal-1")
        return [{ id: "contact-current" }]
      }
    })
    assert.equal(result.ok, true)
    assert.equal(result.contact.id, "contact-current")
    assert.equal(result.staleContactId, true)
    assert.equal(result.fallbackByDeal, true)
    assert.deepEqual(requested, ["contact-stale", "contact-current"])
  })

  await test("falha de forma controlada quando deal nao tem contato", async () => {
    const result = await resolveConsultationReminderContact({
      contactId: "contact-stale", dealId: "deal-1",
      getContact: async () => { throw httpError(404) },
      listDealContacts: async () => []
    })
    assert.equal(result.ok, false)
    assert.equal(result.httpStatus, 404)
    assert.equal(result.reasonCode, "stale_contact_deal_without_contact")
  })

  await test("nao escolhe arbitrariamente entre varios contatos", async () => {
    let contactCalls = 0
    const result = await resolveConsultationReminderContact({
      contactId: "contact-stale", dealId: "deal-1",
      getContact: async () => {
        contactCalls += 1
        throw httpError(404)
      },
      listDealContacts: async () => [{ id: "contact-a" }, { id: "contact-b" }]
    })
    assert.equal(result.ok, false)
    assert.equal(result.httpStatus, 409)
    assert.equal(result.reasonCode, "stale_contact_multiple_contacts")
    assert.equal(contactCalls, 1)
  })

  await test("nao trata associacoes repetidas do mesmo contato como ambiguidade", async () => {
    const result = await resolveConsultationReminderContact({
      contactId: "contact-stale", dealId: "deal-1",
      getContact: async id => {
        if (id === "contact-stale") throw httpError(404)
        return { id, properties: {} }
      },
      listDealContacts: async () => [{ id: "contact-current" }, { id: "contact-current" }]
    })
    assert.equal(result.ok, true)
    assert.equal(result.contact.id, "contact-current")
  })

  for (const status of [401, 403, 429, 500]) {
    await test(`nao executa fallback quando busca direta retorna ${status}`, async () => {
      let associationCalls = 0
      await assert.rejects(() => resolveConsultationReminderContact({
        contactId: "contact-current", dealId: "deal-1",
        getContact: async () => { throw httpError(status) },
        listDealContacts: async () => { associationCalls += 1; return [] }
      }), error => error?.response?.status === status)
      assert.equal(associationCalls, 0)
    })
  }

  await test("falha de forma controlada sem dealId", async () => {
    let associationCalls = 0
    const result = await resolveConsultationReminderContact({
      contactId: "contact-stale", dealId: "",
      getContact: async () => { throw httpError(404) },
      listDealContacts: async () => { associationCalls += 1; return [] }
    })
    assert.equal(result.ok, false)
    assert.equal(result.httpStatus, 404)
    assert.equal(result.reasonCode, "stale_contact_deal_missing")
    assert.equal(associationCalls, 0)
  })

  await test("trata deal inexistente sem esconder outros erros", async () => {
    const missing = await resolveConsultationReminderContact({
      contactId: "contact-stale", dealId: "deal-missing",
      getContact: async () => { throw httpError(404) },
      listDealContacts: async () => { throw httpError(404) }
    })
    assert.equal(missing.reasonCode, "stale_contact_deal_not_found")

    await assert.rejects(() => resolveConsultationReminderContact({
      contactId: "contact-stale", dealId: "deal-error",
      getContact: async () => { throw httpError(404) },
      listDealContacts: async () => { throw httpError(500) }
    }), error => error?.response?.status === 500)
  })

  await test("trata unico contato associado que tambem nao existe", async () => {
    let calls = 0
    const result = await resolveConsultationReminderContact({
      contactId: "contact-stale", dealId: "deal-1",
      getContact: async () => { calls += 1; throw httpError(404) },
      listDealContacts: async () => [{ id: "contact-also-stale" }]
    })
    assert.equal(calls, 2)
    assert.equal(result.ok, false)
    assert.equal(result.reasonCode, "stale_contact_associated_contact_not_found")
  })

  await test("preserva comportamento quando o evento nao possui contactId", async () => {
    let contactCalls = 0
    let associationCalls = 0
    const result = await resolveConsultationReminderContact({
      contactId: "", dealId: "deal-1",
      getContact: async () => { contactCalls += 1 },
      listDealContacts: async () => { associationCalls += 1 }
    })
    assert.equal(result.ok, true)
    assert.equal(result.contact, null)
    assert.equal(contactCalls, 0)
    assert.equal(associationCalls, 0)
  })

  console.log("consultation-reminder-contact-fallback.test.js: ok")
})().catch(error => {
  console.error(error)
  process.exit(1)
})
