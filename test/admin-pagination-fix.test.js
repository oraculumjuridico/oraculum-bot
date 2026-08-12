"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const transportSource = fs.readFileSync(path.join(__dirname, "..", "src", "domain", "whatsapp-transport.js"), "utf8")

// ================================================================
// CORREÇÃO 1 — TOTAL REAL DOS CASOS
// ================================================================

describe("Total real dos casos", () => {
  it("adminResumoOperacional usa total real do HubSpot, não tamanho do array", () => {
    assert.match(source, /hsAdminContarNegociosPorStages\(stagesAtivos\)/)
    assert.match(source, /totalClientes:\s*totalAtivos/)
    assert.match(source, /analise:\s*totalAnalise/)
  })

  it("adminItensAtivosHubSpot respeita o total mínimo entre contagem e limite", () => {
    assert.match(source, /adminItensAtivosHubSpot\(Math\.min\(totalAtivos,\s*100\)\)/)
  })
})

// ================================================================
// CORREÇÃO 2 — PAGINAÇÃO
// ================================================================

describe("Paginação", () => {
  it("telaAdminPrioridades carrega até 100 itens para paginação completa", () => {
    assert.match(source, /gerarPrioridadesAdmin\(\s*100\s*\)/)
  })

  it("telaAdminPrioridades armazena lista completa na sessão, não só a página", () => {
    assert.match(source, /salvarListaCasosAdmin\(from,\s*itens,\s*ADMIN_IDS\.prioridades/)
    assert.doesNotMatch(source, /salvarListaCasosAdmin\(from,\s*itensPagina,\s*ADMIN_IDS\.prioridades/)
  })

  it("telaAdminListaCasos armazena estado de paginação completo na sessão", () => {
    assert.match(source, /salvarListaCasosAdmin\(from,\s*itens,\s*rotaLista,\s*pagina,\s*tamanhoPagina,\s*itens\.length,\s*totalPaginas,\s*null,\s*voltar\)/)
  })

  it("telaAdminPrioridades exibe indicador Exibindo X–Y de Z", () => {
    assert.match(source, /Exibindo \$\{inicioExibicao\}–\$\{fimExibicao\} de \$\{totalItens\}/)
  })

  it("telaAdminListaCasos exibe indicador Exibindo X–Y de Z", () => {
    assert.match(source, /Exibindo \$\{inicioExibicao\}–\$\{fimExibicao\} de \$\{itens\.length\}/)
  })

  it("categorias carregam limite 100 para cobrir todos os casos", () => {
    assert.match(source, /adminFonteCasos\(filtro,\s*\[HS_STAGE\.LEAD,\s*HS_STAGE\.CADASTRO\],\s*100\)/)
    assert.match(source, /adminFonteCasos\(filtro,\s*\[HS_STAGE\.ANALISE\],\s*100\)/)
    assert.match(source, /adminFonteCasos\(filtro,\s*\[HS_STAGE\.AGUARDANDO_DOCS,\s*HS_STAGE\.ANALISE,\s*HS_STAGE\.DOCS\],\s*100\)/)
    assert.match(source, /adminFonteCasos\(filtro,\s*Object\.values\(HS_STAGE\)\.filter\(stage\s*=>\s*stage\s*!==\s*HS_STAGE\.FINAL\),\s*100\)/)
  })
})

// ================================================================
// CORREÇÃO 5 — TEXTO LONGO E MENU INTERATIVO
// ================================================================

describe("Texto longo e menu interativo", () => {
  it("enviarRespostaAdmin divide texto longo e retorna true apos texto enviado", () => {
    const start = source.indexOf("async function enviarRespostaAdmin")
    const end = source.indexOf("async function notificarMensagemUrgente", start)
    const trecho = source.slice(start, end)

    assert.match(trecho, /const\s+textoOk\s*=\s*await\s+enviar\(from,\s*texto,\s*null,\s*true,\s*messageId\)/)
    assert.match(trecho, /if\s*\(\s*!textoOk\s*\)\s*return\s*false/)
    assert.match(trecho, /await\s+enviar\(from,\s*"Opções",\s*opcoes,\s*true,\s*messageId,\s*true\)/)
  })

  it("enviar aceita parametro semFallback131009", () => {
    assert.match(transportSource, /async\s+function\s+enviar\(to,\s*texto,\s*opcoes\s*=\s*null,\s*comDelay\s*=\s*true,\s*messageId\s*=\s*null,\s*semFallback131009\s*=\s*false\)/)
    assert.match(transportSource, /codigoErro\s*===\s*131009\s*&&\s*opcoes\s*&&\s*opcoes\.length\s*>\s*0\s*&&\s*!semFallback131009/)
  })

  it("telaAdminResumoDiario inclui Prioridades no menu", () => {
    const start = source.indexOf("async function telaAdminResumoDiario")
    const end = source.indexOf("function telaDetalheCasoAdmin", start)
    const trecho = source.slice(start, end)

    assert.match(trecho, /\{ id:\s*ADMIN_IDS\.prioridades,\s*title:\s*"📌 Prioridades"\s*\}/)
  })
})

// ================================================================
// CORREÇÃO 6 — PRESERVAR CORREÇÕES ANTERIORES
// ================================================================

describe("Preservar correções anteriores", () => {
  it("não há reconciliação de título no fluxo de leitura", () => {
    const start = source.indexOf("async function hsAdminItensPorStages")
    const end = source.indexOf("async function hsAdminItemPorDealId", start)
    const trecho = source.slice(start, end)
    assert.doesNotMatch(trecho, /reconciliarTituloNegocioHubSpotAdmin\(/)
  })

  it("não há busca individual de contato no fluxo de leitura", () => {
    const start = source.indexOf("async function hsAdminItensPorStages")
    const end = source.indexOf("async function hsAdminItemPorDealId", start)
    const trecho = source.slice(start, end)
    assert.doesNotMatch(trecho, /hsAdminBuscarContatoDoNegocio/)
  })

  it("adminResumoOperacional não dispara mapearComLimite com contato", () => {
    const start = source.indexOf("async function adminResumoOperacional")
    const end = source.indexOf("function gerarAlertasOperacionaisAdmin", start)
    const trecho = source.slice(start, end)
    assert.doesNotMatch(trecho, /mapearComLimite/)
  })
})

// ================================================================
// TESTE FUNCIONAL — enviarRespostaAdmin
// ================================================================

describe("Funcional enviarRespostaAdmin", () => {
  it("envia texto longo separado e depois menu curto", async () => {
    const chamadas = []
    const enviarMock = async (to, texto, opcoes, comDelay, messageId, semFallback) => {
      chamadas.push({ to, texto, opcoes, semFallback })
      return true
    }

    const sandbox = {
      sanitizarTextoEntrada: v => String(v || "").trim(),
      enviar: enviarMock,
      resultado: null
    }

    const codigo = `
async function enviarRespostaAdmin(from, resposta, messageId) {
  const texto = sanitizarTextoEntrada(resposta?.texto || "")
  const opcoes = Array.isArray(resposta?.opcoes) ? resposta.opcoes : null
  if (!texto && (!opcoes || opcoes.length === 0)) return false

  if (texto.length > 800 && opcoes && opcoes.length > 0) {
    const textoOk = await enviar(from, texto, null, true, messageId)
    if (!textoOk) return false
    const menuOk = await enviar(from, "Escolha uma opção abaixo:", opcoes, true, messageId, true)
    return menuOk
  }

  return await enviar(from, texto, opcoes || null, true, messageId)
}
resultado = enviarRespostaAdmin
`

    vm.runInNewContext(codigo, sandbox)
    const fn = sandbox.resultado

    const resposta = {
      texto: "A".repeat(900),
      opcoes: [{ id: "1", title: "Opção 1" }]
    }

    const result = await fn("5511999999999", resposta, "msg123")
    assert.strictEqual(result, true)
    assert.strictEqual(chamadas.length, 2)
    assert.strictEqual(chamadas[0].texto, "A".repeat(900))
    assert.strictEqual(chamadas[0].opcoes, null)
    assert.strictEqual(chamadas[1].texto, "Escolha uma opção abaixo:")
    assert.strictEqual(chamadas[1].opcoes?.length, 1)
    assert.strictEqual(chamadas[1].semFallback, true)
  })

  it("retorna false se texto longo falhar no envio", async () => {
    const enviarMock = async () => false

    const sandbox = {
      sanitizarTextoEntrada: v => String(v || "").trim(),
      enviar: enviarMock,
      resultado: null
    }

    const codigo = `
async function enviarRespostaAdmin(from, resposta, messageId) {
  const texto = sanitizarTextoEntrada(resposta?.texto || "")
  const opcoes = Array.isArray(resposta?.opcoes) ? resposta.opcoes : null
  if (!texto && (!opcoes || opcoes.length === 0)) return false

  if (texto.length > 800 && opcoes && opcoes.length > 0) {
    const textoOk = await enviar(from, texto, null, true, messageId)
    if (!textoOk) return false
    const menuOk = await enviar(from, "Escolha uma opção abaixo:", opcoes, true, messageId, true)
    return menuOk
  }

  return await enviar(from, texto, opcoes || null, true, messageId)
}
resultado = enviarRespostaAdmin
`

    vm.runInNewContext(codigo, sandbox)
    const fn = sandbox.resultado

    const resposta = {
      texto: "A".repeat(900),
      opcoes: [{ id: "1", title: "Opção 1" }]
    }

    const result = await fn("5511999999999", resposta, "msg123")
    assert.strictEqual(result, false)
  })
})

console.log("admin-pagination-fix.test.js: ok")
