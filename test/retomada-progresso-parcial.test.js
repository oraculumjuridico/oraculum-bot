const { describe, it } = require("node:test")
const assert = require("node:assert")

delete require.cache[require.resolve("../src/domain/hubspot-core")]
const hubspotCore = require("../src/domain/hubspot-core")
hubspotCore.hsBuscarPorPhone = async () => ({ id: "999" })
hubspotCore.hsCriarContato = async () => { throw new Error("hsCriarContato nao deveria ser chamado") }
hubspotCore.hsCriarNegocio = async () => { throw new Error("hsCriarNegocio nao deveria ser chamado") }

const server = require("../server")
const {
  processarInterno,
  processarRetomadaOuReinicio,
  usuarioTemProgressoParaRetomada,
  STAGES,
} = server

const FAKE_FROM = "5511999990001@wa.com"

function makeUser(overrides = {}) {
  return {
    from: FAKE_FROM,
    nomeWA: "Cliente Teste",
    stage: null,
    etapa: null,
    _stageRetomadaOriginal: null,
    _fluxoEncerrado: false,
    jaOfereceuRetomada: false,
    aguardandoRetomada: false,
    _retomadaEhLeadFrio: false,
    aguardandoResposta: false,
    lastPergunta: null,
    lastPerguntaPayload: null,
    nomeConfirmado: false,
    nome: "",
    cidade: "",
    area: "",
    situacao: "",
    urgencia: "normal",
    _casoAnteriorCliente: false,
    atendimentoParaTerceiro: false,
    modoTexto: null,
    contatoId: null,
    negocioId: null,
    numeroCaso: null,
    ...overrides,
  }
}

async function callInternal(overridesUser = {}, text = "", buttonId = "", msgType = "text") {
  const u = makeUser(overridesUser)
  const msgObj = msgType === "interactive"
    ? { type: "interactive", button_reply: { id: buttonId, title: buttonId } }
    : { type: "text", text: { body: text } }
  const result = await processarInterno(FAKE_FROM, u.nomeWA, text, msgObj, u)
  return { result, u }
}

describe("retomada de progresso parcial", () => {
  describe("gate: usuarioTemProgressoParaRetomada", () => {
    it("abandono sem nenhuma resposta real -> sem progresso", async () => {
      const u = makeUser()
      assert.strictEqual(usuarioTemProgressoParaRetomada(u), false)
    })

    it("stage inválido sem dados -> fallback seguro", async () => {
      const u = makeUser({ _stageRetomadaOriginal: "stage_inexistente" })
      assert.strictEqual(usuarioTemProgressoParaRetomada(u), false)
    })

    it("apenas nome do perfil WhatsApp não conta como progresso", async () => {
      const u = makeUser({ nomeWA: "Perfil WP", nomeConfirmado: false })
      assert.strictEqual(usuarioTemProgressoParaRetomada(u), false)
    })
  })

  describe("fluxo real: retomada preserva stage e exibe menu", () => {
    it("nome confirmado e stage cidade: retorna menu de retomada", async () => {
      const { result, u } = await callInternal({
        _fluxoEncerrado: true,
        contatoId: "123",
        nomeConfirmado: true,
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
      })

      assert.strictEqual(u._fluxoEncerrado, false)
      assert.strictEqual(u._stageRetomadaOriginal, STAGES.ACOLHIMENTO_CIDADE)
      assert.ok(result)
      const texto = (result.texto || "").toLowerCase()
      assert.ok(texto.includes("atendimento pausado") || texto.includes("como deseja continuar"))
      const opcoes = result.opcoes || []
      const ids = opcoes.map(o => o.id)
      assert.ok(ids.includes("rm_continuar"))
      assert.ok(ids.includes("rm_recomecar"))
      assert.ok(ids.includes("m_encerrar"))
    })
  })

  describe("fluxo real: continuar avanca para resumo", () => {
    it("rm_continuar no menu de retomada avanca para resumo", async () => {
      const u = makeUser({
        stage: STAGES.RETOMADA_MENU,
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
        nomeConfirmado: true,
        cidade: "São Paulo",
      })

      const resposta = await processarRetomadaOuReinicio(FAKE_FROM, u, "", "rm_continuar")
      assert.strictEqual(u.stage, STAGES.RESUMO_RETOMADA)
      assert.ok(resposta)
      const texto = (resposta.texto || "").toLowerCase()
      assert.ok(texto.includes("continuar") || texto.includes("corrigir") || texto.includes("recomeçar"))
    })
  })

  describe("fluxo real: abandono na descricao sem relato", () => {
    it("permanece na solicitacao de descricao apos continuar", async () => {
      const u = makeUser({
        stage: STAGES.RETOMADA_MENU,
        _stageRetomadaOriginal: STAGES.COLETA_DESC,
        nomeConfirmado: true,
        cidade: "São Paulo",
        area: "",
        situacao: "",
        urgencia: "normal",
        numeroCaso: "123",
        etapa: STAGES.COLETA_DESC,
      })

      const resposta = await processarRetomadaOuReinicio(FAKE_FROM, u, "", "rm_continuar")
      assert.strictEqual(u.stage, STAGES.RESUMO_RETOMADA)

      const u2 = makeUser({
        stage: STAGES.RESUMO_RETOMADA,
        _stageRetomadaOriginal: STAGES.COLETA_DESC,
        nomeConfirmado: true,
        cidade: "São Paulo",
        area: "",
        situacao: "",
        urgencia: "normal",
        numeroCaso: "123",
        etapa: STAGES.COLETA_DESC,
      })

      const resposta2 = await processarRetomadaOuReinicio(FAKE_FROM, u2, "", "rr_continuar")
      assert.notStrictEqual(u2.stage, STAGES.ACOLHIMENTO)
      assert.notStrictEqual(u2.stage, STAGES.RETOMADA_MENU)
      assert.notStrictEqual(u2.stage, STAGES.RESUMO_RETOMADA)

      const texto = (resposta2.texto || "").toLowerCase()
      assert.ok(
        texto.includes("descreva") || texto.includes("caso") || texto.includes("relato"),
        `Esperado pergunta de descrição, recebido: ${texto}`
      )
    })
  })

  describe("fluxo real: contato e negocio existentes nao criam duplicidade", () => {
    it("nenhuma criacao de contato ou negocio e chamada", async () => {
      const { u } = await callInternal({
        _fluxoEncerrado: true,
        contatoId: "123",
        negocioId: "456",
        nomeConfirmado: true,
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
      })

      assert.strictEqual(u.contatoId, "123")
      assert.strictEqual(u.negocioId, "456")
      assert.strictEqual(u._fluxoEncerrado, false)
      assert.strictEqual(u._stageRetomadaOriginal, STAGES.ACOLHIMENTO_CIDADE)
    })
  })

  describe("persistencia e restauracao do estado", () => {
    it("stage, nomeConfirmado e cidade permanecem apos retomada", async () => {
      const { u } = await callInternal({
        _fluxoEncerrado: true,
        contatoId: "123",
        nomeConfirmado: true,
        cidade: "Rio de Janeiro",
        area: "Direito",
        situacao: "Consulta",
        urgencia: "alta",
        _stageRetomadaOriginal: STAGES.COLETA_DESC,
      })

      assert.strictEqual(u._stageRetomadaOriginal, STAGES.COLETA_DESC)
      assert.strictEqual(u.nomeConfirmado, true)
      assert.strictEqual(u.cidade, "Rio de Janeiro")
      assert.strictEqual(u.area, "Direito")
      assert.strictEqual(u.situacao, "Consulta")
      assert.strictEqual(u.urgencia, "alta")
      assert.strictEqual(u._fluxoEncerrado, false)
    })
  })

  describe("fluxo real: nome confirmado -> cidade apos retomada", () => {
    it("nome confirmado, stage cidade: retomada -> continuar -> resumo -> cidade, sem repetir nome", async () => {
      const { u: u1 } = await callInternal({
        _fluxoEncerrado: true,
        contatoId: "123",
        nomeConfirmado: true,
        cidade: "",
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
      })

      assert.strictEqual(u1._fluxoEncerrado, false)
      assert.strictEqual(u1._stageRetomadaOriginal, STAGES.ACOLHIMENTO_CIDADE)
      assert.strictEqual(u1.nomeConfirmado, true)

      const uMenu = makeUser({
        contatoId: "123",
        stage: STAGES.RETOMADA_MENU,
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
        nomeConfirmado: true,
        cidade: "",
      })

      const r1 = await processarRetomadaOuReinicio(FAKE_FROM, uMenu, "", "rm_continuar")
      assert.strictEqual(uMenu.stage, STAGES.RESUMO_RETOMADA)
      assert.ok(r1)
      const textoResumo = (r1.texto || "").toLowerCase()
      assert.ok(textoResumo.includes("informar cidade") || textoResumo.includes("informar sua cidade"))

      const uResumo = makeUser({
        contatoId: "123",
        numeroCaso: "123",
        stage: STAGES.RESUMO_RETOMADA,
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
        nomeConfirmado: true,
        cidade: "",
        etapa: STAGES.ACOLHIMENTO_CIDADE,
      })

      const r2 = await processarRetomadaOuReinicio(FAKE_FROM, uResumo, "", "rr_continuar")
      assert.strictEqual(uResumo.nomeConfirmado, true)
      const textoFinal = (r2.texto || "").toLowerCase()
      assert.ok(textoFinal.includes("cidade") || textoFinal.includes("onde"))
      assert.ok(!textoFinal.includes("nome") || textoFinal.includes("cidade"))
    })
  })

  describe("fluxo real: retomada sem numeroCaso", () => {
    it("nome confirmado, cidade pendente, sem numeroCaso: retomada -> continuar -> cidade, sem repetir nome", async () => {
      const { u: u1 } = await callInternal({
        _fluxoEncerrado: true,
        contatoId: "123",
        negocioId: "456",
        nome: "Maria Silva",
        nomeConfirmado: true,
        cidade: "",
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
        etapa: STAGES.ACOLHIMENTO_CIDADE,
      })

      assert.strictEqual(u1._fluxoEncerrado, false)
      assert.strictEqual(u1._stageRetomadaOriginal, STAGES.ACOLHIMENTO_CIDADE)
      assert.strictEqual(u1.nomeConfirmado, true)
      assert.strictEqual(u1.nome, "Maria Silva")
      assert.strictEqual(u1.numeroCaso, null)
      assert.strictEqual(u1.contatoId, "123")
      assert.strictEqual(u1.negocioId, "456")

      const uMenu = makeUser({
        contatoId: "123",
        negocioId: "456",
        nome: "Maria Silva",
        nomeConfirmado: true,
        stage: STAGES.RETOMADA_MENU,
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
        cidade: "",
        etapa: STAGES.ACOLHIMENTO_CIDADE,
      })

      const r1 = await processarRetomadaOuReinicio(FAKE_FROM, uMenu, "", "rm_continuar")
      assert.strictEqual(uMenu.stage, STAGES.RESUMO_RETOMADA)
      assert.strictEqual(uMenu.nome, "Maria Silva")
      assert.strictEqual(uMenu.nomeConfirmado, true)
      assert.ok(r1)

      const uResumo = makeUser({
        contatoId: "123",
        negocioId: "456",
        nome: "Maria Silva",
        nomeConfirmado: true,
        stage: STAGES.RESUMO_RETOMADA,
        _stageRetomadaOriginal: STAGES.ACOLHIMENTO_CIDADE,
        cidade: "",
        etapa: STAGES.ACOLHIMENTO_CIDADE,
      })

      const r2 = await processarRetomadaOuReinicio(FAKE_FROM, uResumo, "", "rr_continuar")
      assert.strictEqual(uResumo.nome, "Maria Silva")
      assert.strictEqual(uResumo.nomeConfirmado, true)
      assert.strictEqual(uResumo.numeroCaso, null)
      const textoFinal = (r2.texto || "").toLowerCase()
      assert.ok(textoFinal.includes("cidade") || textoFinal.includes("onde"))
      assert.ok(!textoFinal.includes("nome") || textoFinal.includes("cidade"))
    })
  })
})
