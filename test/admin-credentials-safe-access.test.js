"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

test("menu do caso oferece acesso seguro a credenciais sem armazenar senha", () => {
  assert.match(server, /casoCredenciais:\s*"adm_caso_credenciais"/)
  assert.match(server, /title:\s*"🔐 Credenciais"/)
  assert.match(server, /ADMIN_CREDENTIALS_VAULT_URL/)
  assert.match(server, /Senha: não armazenada no bot, HubSpot, Drive ou notas\./)
  assert.doesNotMatch(server, /item\.u\.(?:senha|password)/)
})

test("cofre administrativo aceita somente URL HTTPS", () => {
  assert.match(server, /url\.protocol === "https:"/)
})
