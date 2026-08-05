const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")

delete process.env.GROQ_KEY

const {
  criarAnaliseFallback,
  normalizarAnaliseIA,
  documentoPossuiEvidenciaNoRelato,
  isDocumentoGenericoRelato,
  calcularDocumentosPendentes,
  obterDocumentosRecomendadosPorArea
} = require("../src/domain/admin-assisted-ai-intelligence")
const {
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido
} = require("../src/domain/admin-assisted-ai-schema")
const {
  iniciarAtendimentoAssistidoAdmin,
  processarAtendimentoAssistidoAdmin,
  criarEstadoAtendimentoAssistido
} = require("../src/domain/admin-assisted-ai-flow")
const {
  configurarStatePersistence,
  persistirSessoesAdminAssistidasAgora,
  carregarSessoesAdminAssistidasPersistidas
} = require("../src/domain/state-persistence")

function depsComSessoes() {
  const sessoesAdminWhatsApp = new Map()
  return {
    sessoesAdminWhatsApp,
    normalizarNumeroWhatsAppEnvio: valor => String(valor || "").replace(/\D/g, ""),
    agendarPersistenciaSessoesAdminAssistidas: () => {},
    logErro: () => {},
    logDebug: () => {}
  }
}

async function main() {
  // 1) IA sugerindo contrato sem o relato mencionar contrato → não incluir em documentosMencionados
  const semContrato = normalizarAnaliseIA({
    confianca: 0.9,
    dados: {
      documentosMencionados: { valor: "Contrato", status: "confirmado" }
    }
  }, "O cliente relata que o banco descontou uma taxa indevida.")
  assert.equal(semContrato.dados.documentosMencionados.valor, null, "Contrato não mencionado no relato não deve aparecer em documentosMencionados")
  assert.equal(semContrato.dados.documentosMencionados.status, "ausente")

  // 2) IA retornando laudo com evidência no relato → preservar
  const comLaudo = normalizarAnaliseIA({
    confianca: 0.9,
    dados: {
      documentosMencionados: { valor: "Laudo médico, RG", status: "confirmado" }
    }
  }, "O cliente apresentou laudo medico do Dr. Silva e RG.")
  assert.ok(comLaudo.dados.documentosMencionados.valor.includes("Laudo"), "Laudo com evidência no relato deve ser preservado")
  assert.ok(comLaudo.dados.documentosMencionados.valor.includes("RG"), "RG com evidência no relato deve ser preservado")

  // 3) Telefone ausente → não vira documento pendente
  const telefonePendente = calcularDocumentosPendentes("Trabalhista", "", [])
  assert.ok(!telefonePendente.includes("Telefone"), "Telefone não deve ser documento pendente")
  assert.ok(!telefonePendente.includes("CPF"), "CPF não deve ser documento pendente")
  assert.ok(!telefonePendente.includes("RG"), "RG não deve ser documento pendente")

  // 4) Carta de indeferimento recomendada → permanece somente em recomendados
  const inssRecomendados = obterDocumentosRecomendadosPorArea("INSS")
  assert.ok(inssRecomendados.includes("Carta de indeferimento"), "Carta de indeferimento deve estar em recomendados")
  const inssPendentes = calcularDocumentosPendentes("INSS", "Carta de indeferimento", [])
  assert.ok(!inssPendentes.includes("Carta de indeferimento"), "Carta de indeferimento não deve estar em pendentes quando mencionada")

  // 5) Persistir, reiniciar e retomar mantendo as quatro categorias
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-proveniencia-"))
  configurarStatePersistence({ DATA_DIR: tempDir })

  const from = "55 81 99999-0000"
  const chave = "5581999990000"
  const sessoes = new Map()
  const deps = depsComSessoes()
  deps.sessoesAdminWhatsApp = sessoes

  iniciarAtendimentoAssistidoAdmin(from, deps)
  sessoes.get(chave).adminAssistido.dados = {
    ...criarDadosVaziosAdminAssistido(),
    nomeCompleto: criarCampoAdminAssistido("Maria Silva", "confirmado"),
    telefone: criarCampoAdminAssistido("(81) 99999-0000", "confirmado"),
    cidade: criarCampoAdminAssistido("Recife", "confirmado"),
    uf: criarCampoAdminAssistido("PE", "confirmado"),
    areaJuridica: criarCampoAdminAssistido("Trabalhista", "inferido"),
    tipoCaso: criarCampoAdminAssistido("Verbas rescisórias", "inferido"),
    descricao: criarCampoAdminAssistido("Demissão sem pagamento de rescisão.", "confirmado"),
    empresa: criarCampoAdminAssistido("Acme Ltda", "confirmado"),
    motivo: criarCampoAdminAssistido("Verbas rescisórias", "inferido"),
    documentosMencionados: criarCampoAdminAssistido("CTPS, TRCT", "confirmado"),
    documentosRecebidos: criarCampoAdminAssistido("CTPS", "confirmado"),
    documentosRecomendados: criarCampoAdminAssistido("CTPS, Contrato, Holerites, Extrato FGTS, TRCT, Cartões de ponto, Convenção coletiva", "inferido"),
    documentosPendentes: criarCampoAdminAssistido("Contrato, Holerites, Extrato FGTS, Cartões de ponto, Convenção coletiva", "inferido")
  }
  persistirSessoesAdminAssistidasAgora(sessoes, { propagarErro: true })

  const sessoesRestauradas = new Map()
  carregarSessoesAdminAssistidasPersistidas(sessoesRestauradas)
  const restaurado = sessoesRestauradas.get(chave).adminAssistido
  assert.ok(restaurado, "Sessão deve ser restaurada")
  assert.ok(restaurado.dados, "Dados devem ser restaurados")
  assert.strictEqual(restaurado.dados.documentosMencionados.valor, "CTPS, TRCT")
  assert.strictEqual(restaurado.dados.documentosMencionados.status, "confirmado")
  assert.strictEqual(restaurado.dados.documentosRecebidos.valor, "CTPS")
  assert.strictEqual(restaurado.dados.documentosRecebidos.status, "confirmado")
  assert.ok(restaurado.dados.documentosRecomendados.valor.includes("CTPS"))
  assert.ok(restaurado.dados.documentosRecomendados.valor.includes("Holerites"))
  assert.strictEqual(restaurado.dados.documentosPendentes.valor, "Contrato, Holerites, Extrato FGTS, Cartões de ponto, Convenção coletiva")

  // Retomar após reinício não perde as categorias
  const depsRetomada = depsComSessoes()
  depsRetomada.sessoesAdminWhatsApp = sessoesRestauradas
  const retomada = await processarAtendimentoAssistidoAdmin(from, "admin_assistido_retomar_continuar", { type: "text" }, depsRetomada)
  assert.ok(retomada.texto.includes("Revisão do caso") || retomada.texto.includes("Área identificada"), "Retomada deve funcionar")
  const aposRetomada = sessoesRestauradas.get(chave).adminAssistido
  assert.strictEqual(aposRetomada.dados.documentosMencionados.valor, "CTPS, TRCT")
  assert.strictEqual(aposRetomada.dados.documentosRecebidos.valor, "CTPS")
  assert.ok(aposRetomada.dados.documentosRecomendados.valor.includes("Holerites"))
  assert.strictEqual(aposRetomada.dados.documentosPendentes.valor, "Contrato, Holerites, Extrato FGTS, Cartões de ponto, Convenção coletiva")

  fs.rmSync(tempDir, { recursive: true, force: true })

  console.log("admin-assisted-ai-documentary-provenance.test.js ok")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
