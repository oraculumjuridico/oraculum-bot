const assert = require("node:assert/strict")

const {
  handleConfirmEntryFinalAcceptance
} = require("../src/domain/stage-handlers/confirm-entry-final-acceptance-handler")

function criarContexto(u, texto = "entrada_ok", opcoes = {}) {
  const chamadas = {
    limpezas: [],
    sincronizacoes: [],
    stages: [],
    timers: [],
    audiosModoVoz: [],
    confirmaWhatsapp: [],
    cidades: [],
    voltas: [],
    pedidosCidade: [],
    relatosPendentes: [],
    confirmacoesDados: [],
    iniciosRelato: []
  }
  return {
    chamadas,
    ctx: {
      u,
      texto,
      from: "5511",
      stages: {
        CONFIRMAR_ENTRADA: "confirmar_entrada",
        ACOLHIMENTO_CIDADE: "acolhimento_cidade",
        AUDIO_AGUARDANDO: "audio_aguardando",
        AUDIO_CONFIRMAR_DADOS: "audio_confirmar_dados"
      },
      limparEntradaPendente: usuario => {
        chamadas.limpezas.push(usuario)
        usuario._entradaPendenteTipo = null
        usuario._entradaPendenteValor = null
        usuario._entradaPendenteOrigem = null
      },
      sincronizarContatoNegocioHubSpot: async usuario => {
        chamadas.sincronizacoes.push(usuario)
      },
      setStage: (usuario, stage) => {
        chamadas.stages.push(stage)
        usuario.stage = stage
      },
      iniciarTimer: from => chamadas.timers.push(from),
      primeiroNomeCliente: usuario => usuario.nome?.split(" ")[0] || "",
      enviarAudioModoVoz: async (...args) => chamadas.audiosModoVoz.push(args),
      flowAcolhimentoConfirmaWhatsapp: async (usuario, contexto) => {
        chamadas.confirmaWhatsapp.push({ usuario, contexto })
        return { texto: "confirmar WhatsApp", opcoes: null }
      },
      normalizarNumeroWhatsAppEnvio: valor => `normalizado:${valor}`,
      flowAcolhimentoCidade: async (usuario, contexto) => {
        chamadas.cidades.push({ usuario, contexto })
        return { texto: "informar cidade", opcoes: null }
      },
      voltarParaConfirmacao: async (from, usuario) => {
        chamadas.voltas.push({ from, usuario })
        return { texto: "voltar confirmação", opcoes: null }
      },
      enviarAudioPedidoCidade: async (...args) => chamadas.pedidosCidade.push(args),
      aproveitarRelatoAudioClienteNovoCaso: async (from, usuario) => {
        chamadas.relatosPendentes.push({ from, usuario })
        return opcoes.relatoPendente || null
      },
      respostaRecomecoMenuPrincipal: usuario => ({
        texto: `recomeçar:${usuario.stage}`,
        opcoes: null
      }),
      telaConfirmarDadosAudio: async (from, usuario) => {
        chamadas.confirmacoesDados.push({ from, usuario })
        return { texto: "confirmar dados", opcoes: [] }
      },
      iniciarFluxoRelatoLivre: async (from, usuario, contexto) => {
        chamadas.iniciosRelato.push({ from, usuario, contexto })
        return { texto: "iniciar relato", opcoes: null }
      }
    }
  }
}

async function main() {
  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "nome",
      _entradaPendenteValor: "Maria Silva",
      _entradaPendenteOrigem: "coleta_tel_outro"
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      {
        handled: true,
        response: {
          texto: "●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nQual é o WhatsApp com DDD de *Maria* para contato da equipe?",
          opcoes: null
        }
      }
    )
    assert.equal(u.nome, "Maria Silva")
    assert.equal(u.nomeConfirmado, true)
    assert.equal(u.stage, "coleta_tel_wpp")
    assert.equal(u._entradaPendenteTipo, null)
    assert.equal(u._entradaPendenteValor, null)
    assert.equal(u._entradaPendenteOrigem, null)
    assert.deepEqual(chamadas.sincronizacoes, [u])
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.equal(chamadas.audiosModoVoz.length, 1)
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "telefone",
      _entradaPendenteValor: "11987654321",
      _entradaPendenteOrigem: "coleta_tel_wpp_contato",
      nome: "João Silva",
      nomeConfirmado: true,
      atendimentoParaTerceiro: true
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      {
        handled: true,
        response: { texto: "informar cidade", opcoes: null }
      }
    )
    assert.equal(u.whatsappContato, "normalizado:11987654321")
    assert.equal(u.whatsappVerificado, true)
    assert.equal(u.telefoneEhDoCliente, false)
    assert.equal(u._entradaPendenteTipo, null)
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.deepEqual(chamadas.cidades[0].contexto, {
      from: "5511",
      suprimirAudio: true
    })
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "telefone",
      _entradaPendenteValor: "11987654321",
      _entradaPendenteOrigem: "coleta_tel_wpp",
      _corrigindoWhatsappConfirmacao: true
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      {
        handled: true,
        response: { texto: "voltar confirmação", opcoes: null }
      }
    )
    assert.equal(u.whatsappContato, "normalizado:11987654321")
    assert.equal(u.whatsappVerificado, true)
    assert.equal(u.telefoneEhDoCliente, true)
    assert.equal("_corrigindoWhatsappConfirmacao" in u, false)
    assert.equal(chamadas.voltas.length, 1)
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "telefone",
      _entradaPendenteValor: "11987654321",
      _entradaPendenteOrigem: "coleta_tel_wpp",
      _novoCasoDeCliente: true
    }
    const relatoPendente = { texto: "relato aproveitado", opcoes: null }
    const { ctx, chamadas } = criarContexto(u, "entrada_ok", { relatoPendente })
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      { handled: true, response: relatoPendente }
    )
    assert.equal(chamadas.relatosPendentes.length, 1)
    assert.deepEqual(chamadas.stages, [])
    assert.deepEqual(chamadas.timers, [])
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "cidade",
      _entradaPendenteValor: "Recife",
      _entradaPendenteOrigem: "coleta_cidade",
      descricao: "Relato existente"
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      {
        handled: true,
        response: { texto: "confirmar dados", opcoes: [] }
      }
    )
    assert.equal(u.cidade, "Recife")
    assert.equal(u.stage, "audio_confirmar_dados")
    assert.equal(u._entradaPendenteTipo, null)
    assert.deepEqual(chamadas.sincronizacoes, [u])
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.equal(chamadas.confirmacoesDados.length, 1)
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "nome",
      _entradaPendenteValor: "Nome pendente",
      _entradaPendenteOrigem: "origem"
    }
    const { ctx, chamadas } = criarContexto(u, "entrada_corrigir")
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      { handled: false, response: null }
    )
    assert.equal(u._entradaPendenteTipo, "nome")
    assert.equal(u._entradaPendenteValor, "Nome pendente")
    assert.equal(u._entradaPendenteOrigem, "origem")
    assert.deepEqual(chamadas.limpezas, [])
    assert.deepEqual(chamadas.sincronizacoes, [])
  }

  {
    const u = {
      stage: "cliente",
      _entradaPendenteTipo: "nome",
      _entradaPendenteValor: "Nome pendente",
      _entradaPendenteOrigem: "origem"
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.limpezas, [])
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "desconhecido",
      _entradaPendenteValor: "valor",
      _entradaPendenteOrigem: "origem",
      _entradaPendenteExtra: { campo: "preservado" }
    }
    const { ctx, chamadas } = criarContexto(u)
    const estadoAntes = structuredClone(u)
    assert.deepEqual(
      await handleConfirmEntryFinalAcceptance(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(chamadas, {
      limpezas: [],
      sincronizacoes: [],
      stages: [],
      timers: [],
      audiosModoVoz: [],
      confirmaWhatsapp: [],
      cidades: [],
      voltas: [],
      pedidosCidade: [],
      relatosPendentes: [],
      confirmacoesDados: [],
      iniciosRelato: []
    })
  }

  console.log("confirm-entry-final-acceptance-handler.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
