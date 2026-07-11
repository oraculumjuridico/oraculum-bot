const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { criarGracefulShutdown } = require("../src/infrastructure/graceful-shutdown")

async function main() {
  const eventos = []
  let liberarHttp
  let liberarFechamento
  const fechamentoHttp = new Promise(resolve => { liberarHttp = resolve })
  const fechamento = new Promise(resolve => { liberarFechamento = resolve })
  const encerrar = criarGracefulShutdown({
    persistirUsersAgora: options => { assert.equal(options.propagarErro, true); eventos.push("users") },
    persistirSessoesAdminAssistidasAgora: (sessoes, options) => { assert.equal(sessoes.id, "sessoes-ficticias"); assert.equal(options.propagarErro, true); eventos.push("sessoes") },
    sessoesAdminWhatsApp: { id: "sessoes-ficticias" },
    fecharServidorHttp: async () => { eventos.push("http:start"); await fechamentoHttp; eventos.push("http:end") },
    closeExternalStateRepository: async () => { eventos.push("close:start"); await fechamento; eventos.push("close:end") },
    exit: code => eventos.push(`exit:${code}`),
    logErro: () => { throw new Error("nao deveria registrar erro") },
    timeoutMs: 1000
  })
  const primeira = encerrar("SIGTERM")
  const duplicada = encerrar("SIGINT")
  assert.equal(primeira, duplicada)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(eventos, ["users", "sessoes", "http:start"])
  liberarHttp()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(eventos, ["users", "sessoes", "http:start", "http:end", "close:start"])
  liberarFechamento()
  await primeira
  assert.deepEqual(eventos, ["users", "sessoes", "http:start", "http:end", "close:start", "close:end", "exit:0"])

  const falhas = []
  await criarGracefulShutdown({
    persistirUsersAgora: () => { const error = new Error("detalhe privado"); error.code = "LOCAL_WRITE_FAILED"; throw error },
    persistirSessoesAdminAssistidasAgora: () => {},
    closeExternalStateRepository: async () => { const error = new Error("segredo banco"); error.code = "FLUSH_FAILED"; throw error },
    logErro: (_categoria, mensagem) => falhas.push(mensagem),
    exit: code => falhas.push(`exit:${code}`),
    timeoutMs: 1000
  })("SIGINT")
  assert.ok(falhas.some(item => item.includes("LOCAL_WRITE_FAILED")))
  assert.ok(falhas.some(item => item.includes("FLUSH_FAILED")))
  assert.equal(falhas.join(" ").includes("detalhe privado"), false)
  assert.equal(falhas.join(" ").includes("segredo banco"), false)
  assert.equal(falhas.at(-1), "exit:0")

  const timeout = []
  await criarGracefulShutdown({
    persistirUsersAgora: () => timeout.push("users"),
    persistirSessoesAdminAssistidasAgora: () => timeout.push("sessoes"),
    closeExternalStateRepository: () => new Promise(() => {}),
    logErro: (_categoria, mensagem) => timeout.push(mensagem),
    exit: code => timeout.push(`exit:${code}`),
    timeoutMs: 10
  })("SIGTERM")
  assert.deepEqual(timeout.slice(0, 2), ["users", "sessoes"])
  assert.ok(timeout.some(item => item.includes("SHUTDOWN_TIMEOUT")))
  assert.equal(timeout.at(-1), "exit:0")

  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
  assert.equal((server.match(/process\.(?:on|once)\(signal/g) || []).length, 1)
  assert.match(server, /for \(const signal of \["SIGTERM", "SIGINT"\]\)/)
  assert.doesNotMatch(server, /persistirSessoesAdminAssistidasAgora\(sessoesAdminWhatsApp\)\s*\n\s*process\.exit\(0\)/)
}

main().then(() => console.log("graceful-shutdown.test.js: ok")).catch(error => { console.error(error); process.exitCode = 1 })
