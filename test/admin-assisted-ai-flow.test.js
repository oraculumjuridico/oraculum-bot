const assert = require("assert")

delete process.env.GROQ_KEY

const {
  ADMIN_ASSISTIDO_ETAPA_INICIAL,
  ADMIN_ASSISTIDO_ETAPA_COLETA,
  ADMIN_ASSISTIDO_ETAPA_REVISAO,
  ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO,
  ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO,
  atendimentoAssistidoAdminAtivo,
  iniciarAtendimentoAssistidoAdmin,
  processarAtendimentoAssistidoAdmin,
  gerarResumoAdminAssistido,
  criarPayloadLogAdminAssistido
} = require("../src/domain/admin-assisted-ai-flow")

const {
  AREAS_JURIDICAS_ADMIN_ASSISTIDO,
  CAMPOS_OBRIGATORIOS_POR_AREA,
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido
} = require("../src/domain/admin-assisted-ai-schema")

function criarDeps(sessoesAdminWhatsApp = new Map()) {
  const logs = []
  return {
    sessoesAdminWhatsApp,
    logs,
    normalizarNumeroWhatsAppEnvio: value => {
      const digitos = String(value || "").replace(/\D/g, "")
      if (!digitos) return ""
      if (digitos.startsWith("55")) return digitos
      if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
      return digitos
    },
    logAdminAssistido: evento => logs.push(evento),
    logErro: (...args) => logs.push({ logErroArgs: args }),
    telaAdminPrincipal: async () => ({
      texto: "Menu Admin",
      opcoes: [{ id: "adm_menu", title: "Menu" }],
      registrarPergunta: false,
      audio: false
    })
  }
}

function dadosTrabalhistasCompletos() {
  return {
    ...criarDadosVaziosAdminAssistido(),
    areaJuridica: criarCampoAdminAssistido("Trabalhista", "inferido"),
    tipoCaso: criarCampoAdminAssistido("Verbas rescisórias", "inferido"),
    descricao: criarCampoAdminAssistido("Demissão sem pagamento de rescisão.", "confirmado"),
    nomeCompleto: criarCampoAdminAssistido("Maria Silva", "confirmado"),
    cpf: criarCampoAdminAssistido("52998224725", "confirmado"),
    telefone: criarCampoAdminAssistido("(81) 99999-0000", "confirmado"),
    cidade: criarCampoAdminAssistido("Recife", "confirmado"),
    uf: criarCampoAdminAssistido("PE", "confirmado"),
    empresa: criarCampoAdminAssistido("Acme Ltda", "confirmado"),
    motivo: criarCampoAdminAssistido("Verbas rescisórias", "inferido"),
    cargo: criarCampoAdminAssistido("Vendedora", "confirmado")
  }
}

async function completarFluxoTrabalhista(from, deps) {
  await processarAtendimentoAssistidoAdmin(
    from,
    "Caso trabalhista para Maria Silva. Empresa Acme Ltda. Demissao sem pagamento de rescisao.",
    { type: "text" },
    deps
  )
  await processarAtendimentoAssistidoAdmin(from, "(81) 99999-0000", { type: "text" }, deps)
  await processarAtendimentoAssistidoAdmin(from, "Recife", { type: "text" }, deps)
  await processarAtendimentoAssistidoAdmin(from, "PE", { type: "text" }, deps)
  return await processarAtendimentoAssistidoAdmin(from, "52998224725", { type: "text" }, deps)
}

async function main() {
  const payloadRedigido = criarPayloadLogAdminAssistido("evento_teste", {
    resultado: "sucesso",
    negocioId: "deal-test",
    nome: "Pessoa Ficticia Completa",
    telefone: "5511999999999",
    relato: "Relato pessoal completo",
    documentos: [{ cpf: "123.456.789-00" }],
    objetoIntegral: { nome: "Pessoa Ficticia Completa" }
  })
  assert.deepEqual(payloadRedigido, {
    evento: "evento_teste",
    origem: "admin_assistido_ia",
    resultado: "sucesso",
    negocioId: "deal-test"
  })
  assert.doesNotMatch(JSON.stringify(payloadRedigido), /Pessoa Ficticia|5511999999999|Relato pessoal|123\.456\.789-00/)

  const sessoesAdminWhatsApp = new Map()
  const deps = criarDeps(sessoesAdminWhatsApp)

  const from = "55 81 99999-0000"
  const chave = "5581999990000"

  assert.equal(atendimentoAssistidoAdminAtivo(from, deps), false)

  const inicio = iniciarAtendimentoAssistidoAdmin(from, deps)
  assert.match(inicio.texto, /Atendimento Assistido por IA/)
  assert.match(inicio.texto, /Descreva o caso livremente/)
  assert.equal(inicio.registrarPergunta, false)
  assert.ok(Array.isArray(inicio.opcoes))
  assert.ok(inicio.opcoes.some(opcao => opcao.id === "admin_assistido_cancelar"))

  const sessaoInicial = sessoesAdminWhatsApp.get(chave)
  assert.equal(sessaoInicial.listaAtiva, "admin_assistido")
  assert.equal(sessaoInicial.adminAssistido.ativo, true)
  assert.equal(sessaoInicial.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_INICIAL)
  assert.equal(sessaoInicial.adminAssistido.historico.length, 0)
  assert.ok(sessaoInicial.adminAssistido.dados.nomeCompleto)
  assert.equal(sessaoInicial.adminAssistido.dados.nomeCompleto.status, "ausente")

  const sessoesVoltar = new Map()
  const depsVoltar = criarDeps(sessoesVoltar)
  iniciarAtendimentoAssistidoAdmin(from, depsVoltar)
  const respostaVoltarRelato = await processarAtendimentoAssistidoAdmin(from, "voltar", { type: "text" }, depsVoltar)
  assert.match(respostaVoltarRelato.texto, /Atendimento Assistido cancelado/)
  assert.equal(sessoesVoltar.get(chave).adminAssistido, null)

  for (const area of AREAS_JURIDICAS_ADMIN_ASSISTIDO) {
    assert.ok(Array.isArray(CAMPOS_OBRIGATORIOS_POR_AREA[area]), `area sem contrato: ${area}`)
    assert.ok(CAMPOS_OBRIGATORIOS_POR_AREA[area].includes("areaJuridica"))
    assert.ok(CAMPOS_OBRIGATORIOS_POR_AREA[area].includes("descricao"))
  }

  const respostaInicial = await processarAtendimentoAssistidoAdmin(
    from,
    "Caso trabalhista para Maria Silva. Empresa Acme Ltda. Demissao sem pagamento de rescisao.",
    { type: "text" },
    deps
  )
  assert.match(respostaInicial.texto, /Área identificada:/)
  assert.match(respostaInicial.texto, /Trabalhista/)
  assert.match(respostaInicial.texto, /Informações encontradas/)
  assert.match(respostaInicial.texto, /telefone ou WhatsApp/)

  let sessaoAtual = sessoesAdminWhatsApp.get(chave)
  assert.equal(sessaoAtual.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_COLETA)
  assert.equal(sessaoAtual.adminAssistido.perguntaPendente, "telefone")
  assert.equal(sessaoAtual.adminAssistido.dados.nomeCompleto.status, "confirmado")
  assert.equal(sessaoAtual.adminAssistido.dados.empresa.status, "confirmado")
  assert.equal(sessaoAtual.adminAssistido.dados.tipoCaso.status, "inferido")

  await processarAtendimentoAssistidoAdmin(from, "(81) 99999-0000", { type: "text" }, deps)
  await processarAtendimentoAssistidoAdmin(from, "Recife", { type: "text" }, deps)
  await processarAtendimentoAssistidoAdmin(from, "PE", { type: "text" }, deps)
  const respostaRevisao = await processarAtendimentoAssistidoAdmin(
    from,
    "529.982.247-25",
    { type: "text" },
    deps
  )

  assert.match(respostaRevisao.texto, /Revisão do caso/)
  assert.doesNotMatch(respostaRevisao.texto, /Não informado|Copiloto Jurídico/)
  assert.equal(respostaRevisao.opcoes.length, 4)
  assert.ok(respostaRevisao.opcoes.some(opcao => opcao.id === "admin_assistido_ficha_completa"))

  sessaoAtual = sessoesAdminWhatsApp.get(chave)
  assert.equal(sessaoAtual.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_REVISAO)
  assert.equal(sessaoAtual.adminAssistido.faltantes.length, 0)
  assert.deepEqual(sessaoAtual.adminAssistido.camposPerguntados, ["telefone", "cidade", "uf", "cpf"])

  const resumoCompleto = gerarResumoAdminAssistido({
    adminAssistido: {
      dados: dadosTrabalhistasCompletos()
    }
  })
  assert.match(resumoCompleto, /Área jurídica:\* Trabalhista/)
  assert.match(resumoCompleto, /Nome completo:\* Maria Silva/)
  assert.match(resumoCompleto, /Empresa:\* Acme Ltda/)
  assert.match(resumoCompleto, /Cargo:\* Vendedora/)
  assert.match(resumoCompleto, /Motivo:\* Verbas rescisórias/)

  const resumoParcial = gerarResumoAdminAssistido({
    adminAssistido: {
      dados: {
        ...dadosTrabalhistasCompletos(),
        email: criarCampoAdminAssistido(null, "ausente"),
        dataDemissao: criarCampoAdminAssistido(null, "ausente")
      }
    }
  })
  assert.doesNotMatch(resumoParcial, /E-mail|Data demissão|Não informado/)

  const resumoComPendenciaPosterior = gerarResumoAdminAssistido({
    adminAssistido: {
      dados: dadosTrabalhistasCompletos(),
      pendentesPosterior: ["cpf"]
    }
  })
  assert.match(resumoComPendenciaPosterior, /Pendências/)
  assert.match(resumoComPendenciaPosterior, /CPF/)

  const respostaEditar = await processarAtendimentoAssistidoAdmin(from, "2", { type: "text" }, deps)
  assert.match(respostaEditar.texto, /Qual campo deseja alterar/)
  assert.match(respostaEditar.texto, /Empresa/)
  sessaoAtual = sessoesAdminWhatsApp.get(chave)
  assert.equal(sessaoAtual.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO)

  const respostaCampo = await processarAtendimentoAssistidoAdmin(from, "Empresa", { type: "text" }, deps)
  assert.match(respostaCampo.texto, /nome da empresa/)
  sessaoAtual = sessoesAdminWhatsApp.get(chave)
  assert.equal(sessaoAtual.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO)
  assert.equal(sessaoAtual.adminAssistido.campoEmEdicao, "empresa")

  const respostaEditada = await processarAtendimentoAssistidoAdmin(from, "Nova Empresa S.A.", { type: "text" }, deps)
  assert.match(respostaEditada.texto, /Revisão do caso/)
  assert.doesNotMatch(respostaEditada.texto, /Confirmado|Inferido|Não informado/)
  sessaoAtual = sessoesAdminWhatsApp.get(chave)
  assert.equal(sessaoAtual.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_REVISAO)
  assert.equal(sessaoAtual.adminAssistido.dados.empresa.valor, "Nova Empresa S.A.")

  const finalizacoes = []
  deps.finalizarCadastroAssistido = async (telefone, u) => {
    finalizacoes.push({ telefone, u: { ...u } })
    assert.equal(telefone, "5581999990000")
    assert.equal(u.nome, "Maria Silva")
    assert.equal(u.cpf, "52998224725")
    assert.equal(u.area, "Trabalhista")
    assert.equal(u.tipo, "Verbas rescisórias")
    assert.match(u.descricao, /Nova Empresa S\.A\./)
    assert.doesNotMatch(u.descricao, /52998224725/)
    assert.equal(u.whatsappVerificado, true)
    assert.equal(u._novoCasoDeCliente, true)
    u.contatoId = "contact-123"
    u.negocioId = "deal-456"
    u.pastaDriveId = "drive-789"
    u.pastaDriveLink = "https://drive.example/folder"
    u.numeroCaso = "CLT.260708.001"
    return u.numeroCaso
  }

  const respostaConfirmar = await processarAtendimentoAssistidoAdmin(from, "1", { type: "text" }, deps)
  assert.match(respostaConfirmar.texto, /✅ Caso criado com sucesso\./)
  assert.match(respostaConfirmar.texto, /CLT\.260708\.001/)
  assert.match(respostaConfirmar.texto, /Contato:\nMaria Silva/)
  assert.match(respostaConfirmar.texto, /Área:\nTrabalhista/)
  assert.equal(finalizacoes.length, 1)
  sessaoAtual = sessoesAdminWhatsApp.get(chave)
  assert.equal(sessaoAtual.listaAtiva, null)
  assert.equal(sessaoAtual.adminAssistido.ativo, false)
  assert.equal(sessaoAtual.adminAssistido.etapa, "cadastro_completo")
  assert.equal(sessaoAtual.adminAssistido.casoCriado.negocioId, "deal-456")
  assert.ok(deps.logs.some(log => log.evento === "criacao_caso_concluida"))
  const logsTecnicos = deps.logs.filter(log => log?.evento)
  const logsSerializados = JSON.stringify(logsTecnicos)
  assert.ok(logsTecnicos.some(log => log.evento === "criacao_caso_iniciada" && log.resultado === "iniciado"))
  assert.ok(logsTecnicos.some(log => log.evento === "criacao_caso_concluida" && log.resultado === "sucesso"))
  assert.ok(logsTecnicos.some(log => log.negocioId === "deal-456" && log.contatoId === "contact-123"))
  assert.doesNotMatch(logsSerializados, /Maria Silva/)
  assert.doesNotMatch(logsSerializados, /5581999990000|99999-0000/)
  assert.doesNotMatch(logsSerializados, /Demiss|rescis|Acme|Nova Empresa|123\.456\.789-00/)
  assert.doesNotMatch(logsSerializados, /"nome"|"telefone"|"relato"|"documentos"/)

  iniciarAtendimentoAssistidoAdmin(from, deps)
  sessoesAdminWhatsApp.set(chave, {
    listaAtiva: "admin_assistido",
    adminAssistido: {
      ativo: true,
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      dados: dadosTrabalhistasCompletos(),
      historico: [],
      analise: null
    }
  })
  const respostaCancelar = await processarAtendimentoAssistidoAdmin(from, "3", { type: "text" }, deps)
  assert.match(respostaCancelar.texto, /Atendimento Assistido cancelado/)
  assert.match(respostaCancelar.texto, /Menu Admin/)
  assert.equal(sessoesAdminWhatsApp.get(chave).adminAssistido, null)
  assert.equal(atendimentoAssistidoAdminAtivo(from, deps), false)

  const sessoesFaltante = new Map()
  const depsFaltante = criarDeps(sessoesFaltante)
  iniciarAtendimentoAssistidoAdmin(from, depsFaltante)
  sessoesFaltante.set(chave, {
    listaAtiva: "admin_assistido",
    adminAssistido: {
      ativo: true,
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      dados: {
        ...dadosTrabalhistasCompletos(),
        telefone: criarCampoAdminAssistido(null, "ausente")
      },
      historico: [],
      analise: null
    }
  })
  const respostaFaltante = await processarAtendimentoAssistidoAdmin(from, "1", { type: "text" }, depsFaltante)
  assert.match(respostaFaltante.texto, /telefone/)
  assert.equal(sessoesFaltante.get(chave).adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_COLETA)
  assert.equal(sessoesFaltante.get(chave).adminAssistido.perguntaPendente, "telefone")

  const sessoesPular = new Map()
  const depsPular = criarDeps(sessoesPular)
  iniciarAtendimentoAssistidoAdmin(from, depsPular)
  sessoesPular.set(chave, {
    listaAtiva: "admin_assistido",
    adminAssistido: {
      ativo: true,
      etapa: ADMIN_ASSISTIDO_ETAPA_COLETA,
      dados: {
        ...dadosTrabalhistasCompletos(),
        cpf: criarCampoAdminAssistido(null, "ausente")
      },
      historico: [],
      analise: null,
      perguntaPendente: "cpf",
      camposPerguntados: ["cpf"],
      faltantes: ["cpf"]
    }
  })
  const respostaPulouCpf = await processarAtendimentoAssistidoAdmin(from, "Informar depois", { type: "text" }, depsPular)
  assert.match(respostaPulouCpf.texto, /Revis/)
  assert.match(respostaPulouCpf.texto, /CPF/)
  const sessaoPular = sessoesPular.get(chave)
  assert.equal(sessaoPular.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_REVISAO)
  assert.deepEqual(sessaoPular.adminAssistido.pendentesPosterior, ["cpf"])

  const sessoesRollback = new Map()
  const depsRollback = criarDeps(sessoesRollback)
  depsRollback.finalizarCadastroAssistido = async (telefone, u) => {
    u.contatoId = "contact-parcial"
    throw Object.assign(new Error("Pessoa Sigilosa 5511987654321 123.456.789-00 relato íntimo documento secreto"), {
      code: "FINALIZATION_INTEGRATION_FAILURE",
      operation: "hubspot_deal",
      nome: "Pessoa Sigilosa",
      telefone: "5511987654321",
      cpf: "123.456.789-00",
      relato: "relato íntimo",
      documentos: ["documento secreto"]
    })
  }
  let rollbackChamado = false
  depsRollback.rollbackCriacaoCasoAssistido = async info => {
    rollbackChamado = true
    assert.equal(info.usuario.contatoId, "contact-parcial")
    assert.equal(info.erro.operation, "hubspot_deal")
  }
  iniciarAtendimentoAssistidoAdmin(from, depsRollback)
  sessoesRollback.set(chave, {
    listaAtiva: "admin_assistido",
    adminAssistido: {
      ativo: true,
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      dados: dadosTrabalhistasCompletos(),
      historico: [],
      analise: null
    }
  })
  const respostaRollback = await processarAtendimentoAssistidoAdmin(from, "1", { type: "text" }, depsRollback)
  assert.match(respostaRollback.texto, /Não consegui criar o caso com segurança/)
  assert.equal(rollbackChamado, true)
  assert.equal(sessoesRollback.get(chave).adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_REVISAO)
  assert.equal(sessoesRollback.get(chave).adminAssistido.ativo, true)
  const logAdminFalha = depsRollback.logs.find(log => log.evento === "criacao_caso_falhou_rollback_sessao")
  const logErroFalha = depsRollback.logs.find(log => log.logErroArgs)
  assert.equal(logAdminFalha.resultado, "falha")
  assert.equal(logAdminFalha.code, "FINALIZATION_INTEGRATION_FAILURE")
  assert.equal(logAdminFalha.operation, "hubspot_deal")
  assert.equal(logErroFalha.logErroArgs.length, 2)
  assert.match(logErroFalha.logErroArgs[1], /code=FINALIZATION_INTEGRATION_FAILURE/)
  assert.match(logErroFalha.logErroArgs[1], /operation=hubspot_deal/)
  const logsFalhaSerializados = JSON.stringify([logAdminFalha, logErroFalha])
  assert.doesNotMatch(logsFalhaSerializados, /Pessoa Sigilosa|5511987654321|123\.456\.789-00|relato íntimo|documento secreto/)

  const sessoesAudio = new Map()
  const depsAudio = criarDeps(sessoesAudio)
  depsAudio.transcreverAudioAdmin = async msg => {
    assert.equal(msg.audio.id, "media-id")
    return "Caso INSS para Joao Silva. Beneficio negado."
  }
  iniciarAtendimentoAssistidoAdmin(from, depsAudio)
  const respostaAudio = await processarAtendimentoAssistidoAdmin(from, "", { type: "audio", audio: { id: "media-id" } }, depsAudio)
  const sessaoAudio = sessoesAudio.get(chave)
  assert.match(respostaAudio.texto, /Transcrevi o seguinte:/)
  assert.match(respostaAudio.texto, /Caso INSS para Joao Silva/)
  assert.equal(respostaAudio.opcoes.length, 2)
  assert.equal(sessaoAudio.adminAssistido.historico[0].tipo, "audio")
  assert.equal(sessaoAudio.adminAssistido.etapa, "confirmar_audio")
  assert.equal(sessaoAudio.adminAssistido.dados.areaJuridica.valor, null)

  const respostaAudioConfirmado = await processarAtendimentoAssistidoAdmin(
    from,
    "admin_assistido_audio_confirmar",
    { type: "text" },
    depsAudio
  )
  assert.match(respostaAudioConfirmado.texto, /Área identificada:/)
  assert.equal(sessoesAudio.get(chave).adminAssistido.dados.areaJuridica.valor, "INSS")

  const sessaoSucessoContrato = new Map()
  const depsSucessoContrato = criarDeps(sessaoSucessoContrato)
  depsSucessoContrato.finalizarCadastroAssistido = async (telefone, u) => {
    u.contatoId = "contact-123"
    u.negocioId = "deal-456"
    u.pastaDriveId = "drive-789"
    u.pastaDriveLink = "https://drive.example/folder"
    u.numeroCaso = "CLI.2026.001"
    return u.numeroCaso
  }
  iniciarAtendimentoAssistidoAdmin(from, depsSucessoContrato)
  sessaoSucessoContrato.set(chave, {
    listaAtiva: "admin_assistido",
    adminAssistido: {
      ativo: true,
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      dados: dadosTrabalhistasCompletos(),
      historico: [],
      analise: null
    }
  })
  const respostaContratoSucesso = await processarAtendimentoAssistidoAdmin(from, "1", { type: "text" }, depsSucessoContrato)
  assert.match(respostaContratoSucesso.texto, /✅ Caso criado com sucesso\./)
  assert.match(respostaContratoSucesso.texto, /CLI\.2026\.001/)
  const logSucesso = depsSucessoContrato.logs.find(log => log.evento === "criacao_caso_concluida")
  assert.equal(logSucesso.contatoId, "contact-123")
  assert.equal(logSucesso.negocioId, "deal-456")
  assert.equal(logSucesso.pastaDriveId, "drive-789")

  const sessaoSucessoBloqueado = new Map()
  const depsSucessoBloqueado = criarDeps(sessaoSucessoBloqueado)
  depsSucessoBloqueado.finalizarCadastroAssistido = async () => "CLI.2026.002"
  iniciarAtendimentoAssistidoAdmin(from, depsSucessoBloqueado)
  sessaoSucessoBloqueado.set(chave, {
    listaAtiva: "admin_assistido",
    adminAssistido: {
      ativo: true,
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      dados: {
        ...dadosTrabalhistasCompletos(),
        nomeCompleto: criarCampoAdminAssistido("Maria Silva", "confirmado")
      },
      historico: [],
      analise: null
    }
  })
  const respostaSucessoBloqueado = await processarAtendimentoAssistidoAdmin(from, "1", { type: "text" }, depsSucessoBloqueado)
  assert.match(respostaSucessoBloqueado.texto, /Não foi possível criar o caso: dados insuficientes\./)
  const logsBloqueio = depsSucessoBloqueado.logs.filter(log => log.evento === "criacao_caso_bloqueada_invariantes")
  assert.ok(logsBloqueio.length >= 1)

  console.log("admin-assisted-ai-flow.test.js ok")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
