"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  getDocsPendentes,
  marcarStatusDocumento
} = require("../src/domain/documents-core")

function usuarioBase() {
  return {
    area: "INSS",
    tipo: "bpc",
    _docKey: "bpc",
    docsEntregues: [],
    docsAusentes: [],
    docsPulados: [],
    docsParciais: [],
    docsDispensados: []
  }
}

{
  const usuario = usuarioBase()
  assert.equal(getDocsPendentes(usuario)[0].id, "doc_rg")
  marcarStatusDocumento(usuario, "doc_rg", "docsEntregues")
  assert.notEqual(getDocsPendentes(usuario)[0]?.id, "doc_rg")
  assert.equal(getDocsPendentes(usuario)[0]?.id, "doc_cpf")
}

{
  const usuario = usuarioBase()
  marcarStatusDocumento(usuario, "doc_rg", "docsParciais")
  assert.notEqual(getDocsPendentes(usuario)[0]?.id, "doc_rg")
  assert.equal(getDocsPendentes(usuario)[0]?.id, "doc_cpf")
}

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const sameFileHandler = source.slice(
  source.indexOf('if (comandoDoc === "docs_rg_verso_junto")'),
  source.indexOf('if (comandoDoc === "docs_rg_sem_verso")')
)
const noBackHandler = source.slice(
  source.indexOf('if (comandoDoc === "docs_rg_sem_verso")'),
  source.indexOf('if (comandoDoc === "docs_pular_doc")')
)
assert.match(sameFileHandler, /marcarStatusDocumento\(u, docRg\.id, "docsEntregues"\)/)
assert.match(noBackHandler, /marcarStatusDocumento\(u, docRg\.id, "docsParciais"\)/)
assert.match(source, /\/verso\/i\.test\(folha\) && recebimentoGuiado\?\.accepted/)
assert.match(source, /if \(rgColetaCompleta\) \{[\s\S]*?marcarStatusDocumento\(u, docAtual\.id, "docsEntregues"\)[\s\S]*?u\.docAtualIdx = 0/)
assert.match(source, /title: "Frente e verso juntos"/)
assert.match(source, /title: "Não tenho o verso"/)

console.log("document-rg-navigation: ok")
