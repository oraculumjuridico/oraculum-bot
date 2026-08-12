"use strict"

const assert = require("node:assert/strict")
const axios = require("axios")

const getOriginal = axios.get
delete process.env.GOOGLE_MAPS_API_KEY

axios.get = async () => {
  const erro = new Error("timeout of 5000ms exceeded")
  erro.code = "ECONNABORTED"
  throw erro
}

const { buscarCidadePorNome } = require("../src/domain/geo-search")

async function main() {
  const resultado = await buscarCidadePorNome("Recife")
  assert.deepEqual(resultado, {
    cidade: "Recife",
    uf: "PE",
    estado: "PE",
    regiao: "Nordeste"
  })
  assert.deepEqual(await buscarCidadePorNome("Eu moro em Recife"), resultado)

  const ambiguo = await buscarCidadePorNome("Bom Jesus")
  assert.equal(ambiguo.multiplos, true)
  assert.ok(ambiguo.opcoes.length > 1)
  assert.ok(ambiguo.opcoes.every(opcao => opcao.cidade === "Bom Jesus" && opcao.uf && opcao.regiao))

  const filtrado = await buscarCidadePorNome("Bom Jesus, PI")
  assert.deepEqual(filtrado, {
    cidade: "Bom Jesus",
    uf: "PI",
    estado: "PI",
    regiao: "Nordeste"
  })
  console.log("geo-search-resilience.test.js: ok")
}

main().catch(erro => {
  console.error(erro)
  process.exitCode = 1
}).finally(() => {
  axios.get = getOriginal
})
