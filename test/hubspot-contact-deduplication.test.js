"use strict"

const assert = require("node:assert/strict")
const axios = require("axios")
const {
  configurarHubSpotCore,
  hsBuscarPorPhone,
  hsCriarContato
} = require("../src/domain/hubspot-core")

async function main() {
  const originalPost = axios.post
  configurarHubSpotCore({ monitor: { cadastros: 0 } })

  try {
    let created = 0
    axios.post = async (url, body) => {
      if (url.endsWith("/contacts/search")) {
        assert.deepEqual(
          body.filterGroups.map(group => ({
            property: group.filters[0].propertyName,
            value: group.filters[0].value
          })),
          [
            { property: "phone", value: "5511999999999" },
            { property: "mobilephone", value: "5511999999999" },
            { property: "phone", value: "551199999999" },
            { property: "mobilephone", value: "551199999999" }
          ]
        )
        return { data: { results: [] } }
      }
      if (url.endsWith("/contacts")) {
        created++
        await new Promise(resolve => setTimeout(resolve, 10))
        return { data: { id: "contact-new" } }
      }
      throw new Error(`unexpected URL: ${url}`)
    }

    const [first, second] = await Promise.all([
      hsCriarContato("5511999999999", { nome: "Maria Teste" }),
      hsCriarContato("5511999999999", { nome: "Maria Teste" })
    ])
    assert.equal(first, "contact-new")
    assert.equal(second, "contact-new")
    assert.equal(created, 1)

    axios.post = async (url, body) => {
      if (url.endsWith("/contacts/search")) {
        return { data: { results: [
          { id: "contact-1", properties: {} },
          { id: "contact-2", properties: {} }
        ] } }
      }
      throw new Error("create must not run")
    }
    await assert.rejects(
      () => hsBuscarPorPhone("5511888888888"),
      error => error.code === "HUBSPOT_CONTACT_PHONE_AMBIGUOUS"
    )
    await assert.rejects(
      () => hsCriarContato("5511888888888", { nome: "Pessoa Ambigua" }),
      error => error.code === "HUBSPOT_CONTACT_PHONE_AMBIGUOUS"
    )

    axios.post = async url => {
      if (url.endsWith("/contacts/search")) {
        return { data: { results: [{ id: "contact-existing", properties: { phone: "5511777777777" } }] } }
      }
      throw new Error("create must not run when contact exists")
    }
    assert.equal(
      await hsCriarContato("5511777777777", { nome: "Pessoa Existente" }),
      "contact-existing"
    )

    let searchBody = null
    axios.post = async (url, body) => {
      if (url.endsWith("/contacts/search")) {
        searchBody = body
        return { data: { results: [{ id: "contact-legacy", properties: { mobilephone: "5581998765432" } }] } }
      }
      if (url.endsWith("/contacts")) {
        assert.equal(body.properties.phone, "5581998765432")
        assert.equal(body.properties.mobilephone, "5581998765432")
        return { data: { id: "contact-with-phone" } }
      }
      throw new Error(`unexpected URL: ${url}`)
    }
    assert.equal((await hsBuscarPorPhone("558198765432")).id, "contact-legacy")
    assert.deepEqual(
      searchBody.filterGroups.map(group => group.filters[0].value),
      ["558198765432", "558198765432", "5581998765432", "5581998765432"]
    )

    axios.post = async (url, body) => {
      if (url.endsWith("/contacts/search")) return { data: { results: [] } }
      if (url.endsWith("/contacts")) {
        assert.equal(body.properties.phone, "5581998765432")
        assert.equal(body.properties.mobilephone, "5581998765432")
        return { data: { id: "contact-with-phone" } }
      }
      throw new Error(`unexpected URL: ${url}`)
    }
    assert.equal(
      await hsCriarContato("5581998765432", { nome: "Pessoa com telefone", whatsappContato: null }),
      "contact-with-phone"
    )

    console.log("hubspot-contact-deduplication.test.js: ok")
  } finally {
    axios.post = originalPost
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
