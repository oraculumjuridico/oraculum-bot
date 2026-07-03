const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const {
  validarAssinaturaMeta
} = require("../src/domain/webhook-security")

const ambienteOriginal = {
  NODE_ENV: process.env.NODE_ENV,
  APP_SECRET: process.env.APP_SECRET,
  META_APP_SECRET: process.env.META_APP_SECRET
}

function configurarVariavel(nome, valor) {
  if (valor === undefined) delete process.env[nome]
  else process.env[nome] = valor
}

function assinatura(secret, rawBody) {
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`
}

function executarMiddleware({
  appSecret,
  metaAppSecret,
  nodeEnv,
  rawBody,
  body,
  header
}) {
  configurarVariavel("APP_SECRET", appSecret)
  configurarVariavel("META_APP_SECRET", metaAppSecret)
  configurarVariavel("NODE_ENV", nodeEnv)

  const resultado = {
    status: null,
    nextCalls: 0,
    inboxCalls: 0
  }
  validarAssinaturaMeta(
    {
      rawBody,
      body,
      get: nome => nome.toLowerCase() === "x-hub-signature-256"
        ? header
        : undefined
    },
    {
      sendStatus: status => {
        resultado.status = status
        return status
      }
    },
    () => {
      resultado.nextCalls += 1
      resultado.inboxCalls += 1
    }
  )
  return resultado
}

async function main() {
  const rawBody = Buffer.from(
    '{ "object": "whatsapp_business_account", "entry": [] }',
    "utf8"
  )
  const body = {
    object: "whatsapp_business_account",
    entry: []
  }

  {
    const secret = "app-secret-teste"
    const resultado = executarMiddleware({
      appSecret: secret,
      nodeEnv: "production",
      rawBody,
      body,
      header: assinatura(secret, rawBody)
    })
    assert.deepEqual(resultado, {
      status: null,
      nextCalls: 1,
      inboxCalls: 1
    })
  }

  {
    const secret = "meta-app-secret-teste"
    const resultado = executarMiddleware({
      metaAppSecret: secret,
      nodeEnv: "staging",
      rawBody,
      body,
      header: assinatura(secret, rawBody)
    })
    assert.deepEqual(resultado, {
      status: null,
      nextCalls: 1,
      inboxCalls: 1
    })
  }

  {
    const resultado = executarMiddleware({
      appSecret: "secret-correto",
      nodeEnv: "production",
      rawBody,
      body,
      header: assinatura("secret-incorreto", rawBody)
    })
    assert.deepEqual(resultado, {
      status: 401,
      nextCalls: 0,
      inboxCalls: 0
    })
  }

  {
    const resultado = executarMiddleware({
      appSecret: "secret-correto",
      nodeEnv: "production",
      rawBody,
      body,
      header: undefined
    })
    assert.deepEqual(resultado, {
      status: 401,
      nextCalls: 0,
      inboxCalls: 0
    })
  }

  {
    const secret = "secret-corpo-original"
    const rawAlterado = Buffer.from(
      '{ "object": "whatsapp_business_account", "entry": [{"id":"alterado"}] }',
      "utf8"
    )
    const resultado = executarMiddleware({
      appSecret: secret,
      nodeEnv: "production",
      rawBody: rawAlterado,
      body,
      header: assinatura(secret, rawBody)
    })
    assert.deepEqual(resultado, {
      status: 401,
      nextCalls: 0,
      inboxCalls: 0
    })
  }

  const consoleErrorOriginal = console.error
  console.error = () => {}
  try {
    for (const nodeEnv of [undefined, "", "development", "test", "staging", "production", "prod"]) {
      const resultado = executarMiddleware({
        nodeEnv,
        rawBody,
        body,
        header: undefined
      })
      assert.deepEqual(
        resultado,
        {
          status: 503,
          nextCalls: 0,
          inboxCalls: 0
        },
        `secret ausente deve falhar fechado em NODE_ENV=${String(nodeEnv)}`
      )
    }
  } finally {
    console.error = consoleErrorOriginal
  }

  {
    const appSecret = "secret-com-precedencia"
    const resultado = executarMiddleware({
      appSecret,
      metaAppSecret: "secret-secundario",
      nodeEnv: "production",
      rawBody,
      body,
      header: assinatura(appSecret, rawBody)
    })
    assert.equal(resultado.nextCalls, 1)
    assert.equal(resultado.status, null)
  }

  const serverSource = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  )
  assert.match(
    serverSource,
    /app\.post\(\s*["']\/webhook["']\s*,\s*validarAssinaturaMeta\s*,/
  )
  const endpointInicio = serverSource.indexOf('app.post("/webhook"')
  const persistencia = serverSource.indexOf(
    "registrarMensagensWebhook(mensagens)",
    endpointInicio
  )
  assert.ok(endpointInicio >= 0)
  assert.ok(persistencia > endpointInicio)
}

main()
  .then(() => console.log("meta-webhook-security.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    configurarVariavel("NODE_ENV", ambienteOriginal.NODE_ENV)
    configurarVariavel("APP_SECRET", ambienteOriginal.APP_SECRET)
    configurarVariavel("META_APP_SECRET", ambienteOriginal.META_APP_SECRET)
  })
