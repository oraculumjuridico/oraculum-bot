"use strict"

const assert = require("node:assert/strict")
const axios = require("axios")
const {
  configurarHubSpotCore,
  hsBuscarPorPhone,
  hsBuscarContatoSeguro,
  hsCriarContato
} = require("../src/domain/hubspot-core")

async function main() {
  const originalPost = axios.post
  configurarHubSpotCore({ monitor: { cadastros: 0 } })

  try {
    let created = 0
    const queriedPhoneValues = new Set()
    axios.post = async (url, body) => {
      if (url.endsWith("/contacts/search")) {
        assert.ok(body.filterGroups.length <= 4)
        body.filterGroups.forEach(group => queriedPhoneValues.add(group.filters[0].value))
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
    assert.deepEqual([...queriedPhoneValues].sort(), [
      "+551199999999", "+5511999999999", "551199999999", "5511999999999"
    ])

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
    assert.equal((await hsBuscarContatoSeguro("5511888888888")).status, "ambiguous")

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

    const searchBodies = []
    axios.post = async (url, body) => {
      if (url.endsWith("/contacts/search")) {
        searchBodies.push(body)
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
      [...new Set(searchBodies.flatMap(body => body.filterGroups.map(group => group.filters[0].value)))].sort(),
      ["+558198765432", "+5581998765432", "558198765432", "5581998765432"]
    )

    axios.post = async (url, body) => {
      if (!url.endsWith("/contacts/search")) throw new Error(`unexpected URL: ${url}`)
      const values = body.filterGroups.map(group => group.filters[0].value)
      return values.includes("+5511978549670")
        ? { data: { results: [{ id: "contact-plus", properties: { phone: "+5511978549670" } }] } }
        : { data: { results: [] } }
    }
    assert.equal((await hsBuscarPorPhone("5511978549670")).id, "contact-plus")

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
