const { describe, it } = require("node:test")
const assert = require("node:assert")
const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")

process.env.ADMIN_WHATSAPP_PASSWORD = "admin-teste-123"

delete require.cache[require.resolve("../server")]
const server = require("../server")
const { app, users } = server

const TEST_ADMIN_PASSWORD = "admin-teste-123"

function makeRequest(port, requestPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { "Content-Type": "application/json", ...headers }

    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      method: body ? "POST" : "GET",
      headers: reqHeaders,
    }, (res) => {
      let data = ""
      res.on("data", chunk => { data += chunk })
      res.on("end", () => {
        let parsed
        try { parsed = JSON.parse(data) } catch { parsed = data }
        resolve({ status: res.statusCode, body: parsed })
      })
    })

    req.on("error", reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

describe("POST /admin/limpar-usuario", () => {
  let testServer
  let port
  let usersStatePath

  const setup = async () => {
    const result = app.listen(0)
    testServer = result
    port = testServer.address().port

    usersStatePath = path.join(process.cwd(), "data", "users-state.json")
    if (!fs.existsSync(usersStatePath)) {
      fs.mkdirSync(path.dirname(usersStatePath), { recursive: true })
      fs.writeFileSync(usersStatePath, JSON.stringify({ savedAt: new Date().toISOString(), users: {} }, null, 2))
    }

    for (const key of Object.keys(users)) delete users[key]
  }

  const teardown = () => {
    if (testServer) testServer.close()
  }

  it("rejeita requisição sem autenticação", async () => {
    await setup()
    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990001", confirmar: "LIMPAR_USUARIO" })
    assert.strictEqual(res.status, 401)
    await teardown()
  })

  it("rejeita confirmação ausente", async () => {
    await setup()
    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990001" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.body.ok, false)
    await teardown()
  })

  it("rejeita confirmação incorreta", async () => {
    await setup()
    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990001", confirmar: "OUTRA_COISA" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.body.ok, false)
    await teardown()
  })

  it("rejeita telefone inválido/vazio", async () => {
    await setup()
    const res = await makeRequest(port, `/admin/limpar-usuario`, { confirmar: "LIMPAR_USUARIO" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.body.ok, false)
    await teardown()
  })

  it("remove somente o telefone solicitado e persiste", async () => {
    await setup()
    users["5511999990001"] = { numeroCaso: "CASO-1", stage: "inicio" }
    users["5511999990002"] = { numeroCaso: "CASO-2", stage: "inicio" }

    const beforeContent = fs.readFileSync(usersStatePath, "utf8")

    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990001", confirmar: "LIMPAR_USUARIO" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })

    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.ok, true)
    assert.strictEqual(res.body.removido, true)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(users, "5511999990001"), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(users, "5511999990002"), true)

    const afterContent = fs.readFileSync(usersStatePath, "utf8")
    const afterJson = JSON.parse(afterContent)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(afterJson.users, "5511999990001"), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(afterJson.users, "5511999990002"), true)
    await teardown()
  })

  it("responde idempotente quando telefone não existe", async () => {
    await setup()
    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990003", confirmar: "LIMPAR_USUARIO" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })

    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.ok, true)
    assert.strictEqual(res.body.removido, false)
    await teardown()
  })

  it("não executa ações HubSpot", async () => {
    await setup()
    users["5511999990001"] = { numeroCaso: "CASO-1", contatoId: "CONTATO-1", negocioId: "NEGOCIO-1" }

    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990001", confirmar: "LIMPAR_USUARIO" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })

    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.ok, true)
    await teardown()
  })

  it("não expõe telefone completo nos logs", async () => {
    await setup()
    users["5511999990001"] = { numeroCaso: "CASO-1", stage: "inicio" }

    const logs = []
    const originalWarn = console.warn
    const originalLog = console.log
    console.warn = (...args) => logs.push(args.join(" "))
    console.log = (...args) => logs.push(args.join(" "))

    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990001", confirmar: "LIMPAR_USUARIO" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })

    console.warn = originalWarn
    console.log = originalLog

    assert.strictEqual(res.status, 200)
    const allLogs = logs.join(" ")
    assert.ok(!allLogs.includes("5511999990001"), "log nao deve expor telefone completo")
    await teardown()
  })

  it("faz rollback quando persistirUsersAgora falha", async () => {
    await setup()
    users["5511999990001"] = { numeroCaso: "CASO-1", stage: "inicio" }
    users["5511999990002"] = { numeroCaso: "CASO-2", stage: "inicio" }

    const originalPersistir = server.api.persistirUsersAgora
    server.api.persistirUsersAgora = async () => {
      throw new Error("falha simulada de persistencia")
    }

    const res = await makeRequest(port, `/admin/limpar-usuario`, { phone: "5511999990001", confirmar: "LIMPAR_USUARIO" }, {
      "X-Admin-Password": TEST_ADMIN_PASSWORD
    })

    server.api.persistirUsersAgora = originalPersistir

    assert.strictEqual(res.status, 500)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(users, "5511999990001"), true)
    assert.deepStrictEqual(users["5511999990001"], { numeroCaso: "CASO-1", stage: "inicio" })
    assert.strictEqual(Object.prototype.hasOwnProperty.call(users, "5511999990002"), true)
    assert.deepStrictEqual(users["5511999990002"], { numeroCaso: "CASO-2", stage: "inicio" })
    await teardown()
  })
})
