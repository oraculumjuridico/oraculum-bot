const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const { createRequire } = require("node:module")

const root = path.join(__dirname, "..")
const realRequire = createRequire(path.join(root, "server.js"))
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-reengagement-routes-"))

process.env.INTERNAL_WEBHOOK_SECRET = "test-secret"
process.env.AUTO_REENGAJAMENTO = "true"
process.env.CALLBACK_IDEMPOTENCY_FILE = path.join(tempDir, "callback-idempotency.json")
process.env.DEBUG_LOGS = "false"

const templateCalls = []
const fakeTemplateService = {
  retomadaAtendimento: async (to, payload, options) => {
    templateCalls.push({ method: "retomadaAtendimento", to, payload, options })
    return true
  },
  casoAtualizacao: async (to, params, options) => {
    templateCalls.push({ method: "casoAtualizacao", to, params, options })
    return true
  },
  consultaLembrete: async () => true,
  templateTipoConsultaLembrete: tipo => `consulta_${tipo}`
}

function carregarServerParaTeste() {
  const serverPath = path.join(root, "server.js")
  let source = fs.readFileSync(serverPath, "utf8")
  source = source.replace(
    'const USERS_STATE_FILE = path.join(DATA_DIR, "users-state.json")',
    `const USERS_STATE_FILE = ${JSON.stringify(path.join(tempDir, "users-state.json"))}`
  )
  source = source.replace("carregarUsersPersistidos()\r\ncarregarWebhookInbox()\r\ncarregarSessoesAdminAssistidasPersistidas(sessoesAdminWhatsApp)\r\nrestaurarTimersPersistidos()", "")
  source = source.replace("carregarUsersPersistidos()\ncarregarWebhookInbox()\ncarregarSessoesAdminAssistidasPersistidas(sessoesAdminWhatsApp)\nrestaurarTimersPersistidos()", "")
  source = source.replace(/iniciarServidor\(\)\s*$/, "module.exports = { app, users }")

  const sandbox = {
    __dirname: root,
    __filename: serverPath,
    Buffer,
    URL,
    clearImmediate,
    clearInterval,
    clearTimeout,
    console,
    global,
    module: { exports: {} },
    process,
    require: request => {
      if (request === "./src/domain/template-service") return fakeTemplateService
      if (request === "./src/domain/meta-waba-validator") {
        return { validarMetaWabaNoBoot: async () => ({ ok: true }) }
      }
      return realRequire(request)
    },
    setImmediate,
    setInterval,
    setTimeout
  }
  sandbox.exports = sandbox.module.exports

  vm.runInNewContext(source, sandbox, { filename: serverPath })
  return sandbox.module.exports
}

function postJson(server, pathUrl, body) {
  const { port } = server.address()
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {})
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathUrl,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "x-oraculum-secret": "test-secret"
      }
    }, res => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", chunk => { raw += chunk })
      res.on("end", () => {
        let json = null
        try { json = raw ? JSON.parse(raw) : null } catch {}
        resolve({ status: res.statusCode, raw, body: json })
      })
    })
    req.on("error", reject)
    req.write(payload)
    req.end()
  })
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server))
  })
}

function fechar(server) {
  return new Promise(resolve => server.close(resolve))
}

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS
const MINUTO_MS = 60 * 1000

function passado(ms) {
  return Date.now() - ms
}

function usuario(overrides = {}) {
  return {
    stage: "acolhimento",
    etapa: "audio_aguardando",
    nomeWA: "Cliente",
    nomePerfilWhatsApp: "Cliente",
    origemCaptacao: "whatsapp",
    nome: "Cliente",
    contatoId: "contact-1",
    negocioId: "deal-1",
    numeroCaso: null,
    consultaStatus: "sem_consulta",
    tipoConsulta: "inicial",
    contextoConversa: null,
    docsEntregues: [],
    docsAusentes: [],
    docsParciais: [],
    docsPulados: [],
    docsDispensados: [],
    historiaIA: [],
    leadIncompletoCapturado: false,
    encerrado: false,
    optOut: false,
    ultimaMsg: passado(3 * HORA_MS),
    ...overrides
  }
}

function resetUsuario(users, phone, data) {
  for (const key of Object.keys(users)) delete users[key]
  users[phone] = { ...usuario({ _numero: phone, phone }), ...data }
  templateCalls.length = 0
}

async function planejar(server, phone, tipoEvento) {
  const dados = await postJson(server, "/reengajamento-dados", { phone })
  assert.equal(dados.status, 200)
  const job = dados.body.jobs.find(item => item.tipoEvento === tipoEvento)
  assert.ok(job, `job ${tipoEvento} deveria ser planejado`)
  return { dados: dados.body, job }
}

async function disparar(server, phone, job, extra = {}) {
  return postJson(server, "/reengajamento", {
    phone,
    dealId: "deal-1",
    jobId: job.id,
    tipoEvento: job.tipoEvento,
    scheduledFor: job.scheduledFor,
    ...extra
  })
}

async function descobrirCandidatos(server) {
  const resposta = await postJson(server, "/reengagement-candidates", {})
  assert.equal(resposta.status, 200)
  assert.ok(Array.isArray(resposta.body.candidates))
  return resposta.body.candidates
}

function totalCallbacksRegistrados() {
  const file = process.env.CALLBACK_IDEMPOTENCY_FILE
  if (!file || !fs.existsSync(file)) return 0
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  return Object.keys(parsed.records || {}).length
}

(async () => {
  const { app, users } = carregarServerParaTeste()
  const server = await listen(app)
  const phone = "5511999990000"

  try {
    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const candidatos = await descobrirCandidatos(server)
      assert.equal(candidatos.length, 1)
      assert.equal(candidatos[0].phone, phone)
      assert.equal(candidatos[0].dealId, "deal-1")
      assert.equal(candidatos[0].contactId, "contact-1")
      assert.equal(candidatos[0].numeroCaso, null)
      assert.equal(candidatos[0].source, "memory")
      assert.ok(candidatos[0].candidateReasons.includes("sem_numero_caso"))
    }

    {
      resetUsuario(users, phone, { encerrado: true, numeroCaso: null, ultimaMsg: passado(3 * HORA_MS) })
      const candidatos = await descobrirCandidatos(server)
      assert.deepEqual(candidatos, [])
    }

    {
      resetUsuario(users, phone, { optOut: true, numeroCaso: null, ultimaMsg: passado(3 * HORA_MS) })
      const candidatos = await descobrirCandidatos(server)
      assert.deepEqual(candidatos, [])
    }

    {
      resetUsuario(users, "sem-telefone", { phone: null, _numero: null, telefone: null, whatsappContato: null })
      const candidatos = await descobrirCandidatos(server)
      assert.deepEqual(candidatos, [])
    }

    {
      resetUsuario(users, phone, { negocioId: null, contatoId: "contact-sem-deal", numeroCaso: null })
      const candidatos = await descobrirCandidatos(server)
      assert.equal(candidatos.length, 1)
      assert.equal(candidatos[0].phone, phone)
      assert.equal(candidatos[0].dealId, null)
      assert.equal(candidatos[0].contactId, "contact-sem-deal")
      assert.ok(candidatos[0].candidateReasons.includes("sem_deal"))
    }

    {
      for (const key of Object.keys(users)) delete users[key]
      users["5511999990000"] = usuario({ _numero: "5511999990000", phone: "5511999990000", negocioId: "deal-1" })
      users["5511888880000"] = usuario({ _numero: "5511888880000", phone: "5511888880000", negocioId: "deal-2", contatoId: "contact-2" })
      const candidatos = await descobrirCandidatos(server)
      assert.equal(candidatos.length, 2)
      assert.deepEqual(candidatos.map(candidato => candidato.phone).sort(), ["5511888880000", "5511999990000"])
    }

    {
      for (const key of Object.keys(users)) delete users[key]
      users["5511999990000"] = usuario({ _numero: "5511999990000", phone: "5511999990000", negocioId: "deal-memory" })
      users["alias-do-mesmo"] = usuario({
        _numero: "5511999990000",
        phone: "5511999990000",
        negocioId: "deal-duplicado"
      })
      const candidatos = await descobrirCandidatos(server)
      assert.equal(candidatos.length, 1)
      assert.equal(candidatos[0].dealId, "deal-memory")
    }

    const enviados = [
      ["abandono_2h", { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) }, "retomadaAtendimento"],
      ["abandono_24h", { numeroCaso: null, ultimaMsg: passado(DIA_MS + 1000) }, "retomadaAtendimento"],
      ["abandono_7d", { numeroCaso: null, ultimaMsg: passado(7 * DIA_MS + 1000), leadIncompletoCapturado: true }, "retomadaAtendimento"],
      ["documentos_pendentes", { numeroCaso: "PREV.260701.001", ultimaMsg: passado(25 * HORA_MS), docsAusentes: ["doc_rg"] }, "casoAtualizacao"],
      ["descricao_pendente", { numeroCaso: null, stage: "descricao_caso", descricao: "", ultimaMsg: passado(3 * HORA_MS) }, "retomadaAtendimento"],
      ["agendamento_nao_concluido", { numeroCaso: "PREV.260701.001", stage: "agendamento_horario", consultaStatus: "sem_consulta", ultimaMsg: passado(3 * HORA_MS) }, "retomadaAtendimento"],
      ["no_show_consulta", { numeroCaso: "PREV.260701.001", consultaStatus: "nao_compareceu", ultimaMsg: passado(30 * 60 * 1000) }, "casoAtualizacao"]
    ]

    for (const [tipoEvento, estado, metodo] of enviados) {
      resetUsuario(users, phone, estado)
      const { job } = await planejar(server, phone, tipoEvento)
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.status, 200, tipoEvento)
      assert.equal(resposta.body.status, "sent", tipoEvento)
      assert.equal(resposta.body.tipoEvento, tipoEvento)
      assert.equal(templateCalls.at(-1).method, metodo)
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const { job } = await planejar(server, phone, "abandono_2h")
      users[phone].ultimaMsg = Date.now()
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "usuario_nao_elegivel")
    }

    {
      resetUsuario(users, phone, { numeroCaso: "PREV.260701.001", stage: "agendamento_horario", consultaStatus: "sem_consulta", ultimaMsg: passado(3 * HORA_MS) })
      const { job } = await planejar(server, phone, "agendamento_nao_concluido")
      users[phone].stage = "cliente"
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "usuario_nao_elegivel")
    }

    {
      resetUsuario(users, phone, { numeroCaso: "PREV.260701.001", ultimaMsg: passado(25 * HORA_MS), docsAusentes: ["doc_rg"] })
      const { job } = await planejar(server, phone, "documentos_pendentes")
      users[phone].docsAusentes = []
      users[phone].docsParciais = []
      users[phone].docsEntregues = ["doc_rg"]
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "usuario_nao_elegivel")
    }

    {
      resetUsuario(users, phone, { numeroCaso: "PREV.260701.001", stage: "agendamento_horario", consultaStatus: "sem_consulta", ultimaMsg: passado(3 * HORA_MS) })
      const { job } = await planejar(server, phone, "agendamento_nao_concluido")
      users[phone].consultaStatus = "agendada"
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "usuario_nao_elegivel")
    }

    for (const campo of ["optOut", "encerrado"]) {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000), [campo]: true })
      const dados = await postJson(server, "/reengajamento-dados", { phone })
      assert.equal(dados.status, 200)
      assert.deepEqual(dados.body.jobs, [])
      const resposta = await disparar(server, phone, {
        id: `${phone}:abandono_2h`,
        tipoEvento: "abandono_2h",
        scheduledFor: new Date(Date.now() - 1000).toISOString()
      })
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "usuario_nao_elegivel")
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const resposta = await disparar(server, phone, { ...job, id: `${job.id}:invalido` })
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "job_nao_planejado")
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const resposta = await disparar(server, phone, job, {
        scheduledFor: new Date(new Date(job.scheduledFor).getTime() - 4 * 60 * 1000).toISOString()
      })
      assert.equal(resposta.body.status, "sent")
      assert.equal(resposta.body.tipoEvento, "abandono_2h")
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(25 * HORA_MS) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.body.status, "sent")
      assert.equal(resposta.body.tipoEvento, "abandono_2h")
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(26 * HORA_MS - MINUTO_MS) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.body.status, "sent")
      assert.equal(resposta.body.tipoEvento, "abandono_2h")
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(26 * HORA_MS + MINUTO_MS) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const chamadasAntes = templateCalls.length
      const callbacksAntes = totalCallbacksRegistrados()
      const resposta = await disparar(server, phone, job)
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "job_expirado")
      assert.equal(templateCalls.length, chamadasAntes)
      assert.equal(totalCallbacksRegistrados(), callbacksAntes)
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const chamadasAntes = templateCalls.length
      const callbacksAntes = totalCallbacksRegistrados()
      const resposta = await disparar(server, phone, job, {
        scheduledFor: new Date(new Date(job.scheduledFor).getTime() - 6 * 60 * 1000).toISOString()
      })
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "scheduledFor_divergente")
      assert.equal(templateCalls.length, chamadasAntes)
      assert.equal(totalCallbacksRegistrados(), callbacksAntes)
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const chamadasAntes = templateCalls.length
      const callbacksAntes = totalCallbacksRegistrados()
      const resposta = await disparar(server, phone, job, {
        scheduledFor: "scheduledFor-invalido"
      })
      assert.equal(resposta.body.status, "skipped")
      assert.equal(resposta.body.reason, "scheduledFor_invalido")
      assert.equal(templateCalls.length, chamadasAntes)
      assert.equal(totalCallbacksRegistrados(), callbacksAntes)
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const chamadasAntes = templateCalls.length
      const resposta = await disparar(server, "5511888880000", job)
      assert.equal(resposta.body.status, "skipped")
      assert.equal(templateCalls.length, chamadasAntes)
    }

    {
      resetUsuario(users, phone, { numeroCaso: null, ultimaMsg: passado(2 * HORA_MS + 1000) })
      const { job } = await planejar(server, phone, "abandono_2h")
      const primeira = await disparar(server, phone, job)
      const chamadasDepoisPrimeira = templateCalls.length
      const segunda = await disparar(server, phone, job)
      assert.equal(primeira.body.status, "sent")
      assert.equal(segunda.body.status, "skipped")
      assert.equal(segunda.body.reason, "duplicado")
      assert.equal(templateCalls.length, chamadasDepoisPrimeira)
    }

    {
      process.env.AUTO_REENGAJAMENTO = "false"
      const disabledLoaded = carregarServerParaTeste()
      const disabledServer = await listen(disabledLoaded.app)
      try {
        disabledLoaded.users[phone] = usuario({ _numero: phone, phone })
        const candidates = await postJson(disabledServer, "/reengagement-candidates", {})
        const data = await postJson(disabledServer, "/reengajamento-dados", { phone })
        const send = await postJson(disabledServer, "/reengajamento", { phone, tipoEvento: "abandono_2h", jobId: "x", scheduledFor: new Date().toISOString() })
        const scheduler = await postJson(disabledServer, "/internal/processar-agendamentos", {})
        assert.equal(candidates.body.status, "disabled"); assert.deepEqual(candidates.body.candidates, [])
        assert.equal(data.body.status, "disabled"); assert.deepEqual(data.body.jobs, [])
        assert.equal(send.body.reason, "feature_disabled")
        assert.equal(scheduler.status, 200); assert.equal(scheduler.body.status, "disabled")
      } finally {
        await fechar(disabledServer)
        process.env.AUTO_REENGAJAMENTO = "true"
      }
    }

    console.log("reengagement-routes.test.js: ok")
  } finally {
    await fechar(server)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  process.exit(0)
})().catch(err => {
  console.error(err)
  process.exit(1)
})
