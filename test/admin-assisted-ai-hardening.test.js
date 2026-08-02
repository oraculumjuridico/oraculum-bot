const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")

delete process.env.GROQ_KEY

const {
  iniciarAtendimentoAssistidoAdmin,
  processarAtendimentoAssistidoAdmin,
  gerarResumoAdminAssistido
} = require("../src/domain/admin-assisted-ai-flow")
const {
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido
} = require("../src/domain/admin-assisted-ai-schema")
const {
  configurarStatePersistence,
  persistirSessoesAdminAssistidasAgora,
  carregarSessoesAdminAssistidasPersistidas
} = require("../src/domain/state-persistence")

function criarDeps(sessoesAdminWhatsApp) {
  return {
    sessoesAdminWhatsApp,
    normalizarNumeroWhatsAppEnvio: value => {
      const digitos = String(value || "").replace(/\D/g, "")
      return digitos.startsWith("55") ? digitos : `55${digitos}`
    },
    agendarPersistenciaSessoesAdminAssistidas: () => {},
    logErro: () => {},
    logDebug: () => {}
  }
}

function dadosCompletos() {
  return {
    ...criarDadosVaziosAdminAssistido(),
    nomeCompleto: criarCampoAdminAssistido("Maria Silva", "confirmado"),
    cpf: criarCampoAdminAssistido("123.456.789-00", "confirmado"),
    telefone: criarCampoAdminAssistido("(81) 99999-0000", "confirmado"),
    cidade: criarCampoAdminAssistido("Recife", "confirmado"),
    uf: criarCampoAdminAssistido("PE", "confirmado"),
    areaJuridica: criarCampoAdminAssistido("Trabalhista", "confirmado"),
    tipoCaso: criarCampoAdminAssistido("Verbas rescisórias", "confirmado"),
    descricao: criarCampoAdminAssistido("Demissão sem pagamento de rescisão, prazo próximo e sem documentos.", "confirmado"),
    empresa: criarCampoAdminAssistido("Acme Ltda", "confirmado"),
    motivo: criarCampoAdminAssistido("Verbas rescisórias", "confirmado")
  }
}

function contarItensDaSecao(texto, titulo, proximoTitulo = null) {
  const inicio = texto.indexOf(titulo)
  assert.ok(inicio >= 0, `seção ausente: ${titulo}`)
  const fim = proximoTitulo ? texto.indexOf(proximoTitulo, inicio + titulo.length) : texto.length
  const secao = texto.slice(inicio, fim >= 0 ? fim : texto.length)
  return secao.split("\n").filter(linha => linha.startsWith("- ")).length
}

function padraoMojibake() {
  const sequencias = [
    [0x56, 0x6f, 0x63, 0xc3],
    [0xc3, 0xa1],
    [0xc3, 0xa3],
    [0xc3, 0xa9],
    [0xc3, 0x81],
    [0xe2, 0x9c],
    [0xf0, 0x9f],
    [0xfffd]
  ]
  return new RegExp(sequencias.map(codigos =>
    codigos.map(codigo => String.fromCharCode(codigo)).join("")
  ).join("|"))
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-admin-assisted-"))
  configurarStatePersistence({ DATA_DIR: tempDir })

  const from = "55 81 99999-0000"
  const chave = "5581999990000"

  const sessoes = new Map()
  const deps = criarDeps(sessoes)
  iniciarAtendimentoAssistidoAdmin(from, deps)
  await processarAtendimentoAssistidoAdmin(
    from,
    "Caso trabalhista para Maria Silva. Empresa Acme Ltda. Demissão sem pagamento de rescisão.",
    { type: "text" },
    deps
  )
  persistirSessoesAdminAssistidasAgora(sessoes, { propagarErro: true })

  const sessoesRestauradas = new Map()
  const resultadoCarga = carregarSessoesAdminAssistidasPersistidas(sessoesRestauradas)
  assert.equal(resultadoCarga.restauradas, 1)
  assert.equal(sessoesRestauradas.get(chave).listaAtiva, "admin_assistido")
  assert.equal(sessoesRestauradas.get(chave).adminAssistido.aguardandoConfirmacaoRetomada, true)

  const retomada = await processarAtendimentoAssistidoAdmin(
    from,
    "qualquer texto antes de escolher",
    { type: "text" },
    criarDeps(sessoesRestauradas)
  )
  assert.match(retomada.texto, /Foi encontrado um atendimento em andamento\./)
  assert.match(retomada.texto, /Deseja continuar\?/)

  const continuacao = await processarAtendimentoAssistidoAdmin(
    from,
    "admin_assistido_retomar_continuar",
    { type: "text" },
    criarDeps(sessoesRestauradas)
  )
  assert.doesNotMatch(continuacao.texto, /Foi encontrado/)
  assert.equal(sessoesRestauradas.get(chave).adminAssistido.aguardandoConfirmacaoRetomada, false)

  const sessoesExpiradas = new Map()
  const antigo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  sessoesExpiradas.set(chave, {
    listaAtiva: "admin_assistido",
    ts: Date.now() - 25 * 60 * 60 * 1000,
    adminAssistido: {
      ativo: true,
      etapa: "aguardando_relato",
      iniciadoEm: antigo,
      atualizadoEm: antigo
    }
  })
  persistirSessoesAdminAssistidasAgora(sessoesExpiradas, { propagarErro: true })
  const sessoesDepoisExpiracao = new Map()
  const cargaExpirada = carregarSessoesAdminAssistidasPersistidas(sessoesDepoisExpiracao)
  assert.equal(cargaExpirada.restauradas, 0)
  assert.equal(sessoesDepoisExpiracao.size, 0)
  const arquivoPersistido = JSON.parse(fs.readFileSync(path.join(tempDir, "admin-assisted-sessions.json"), "utf8"))
  assert.deepEqual(arquivoPersistido.sessoes, {})

  const sessoesAudio = new Map()
  const depsAudio = criarDeps(sessoesAudio)
  depsAudio.transcreverAudioAdmin = async () => "Caso INSS para João Silva. Benefício negado."
  iniciarAtendimentoAssistidoAdmin(from, depsAudio)
  const audio = await processarAtendimentoAssistidoAdmin(from, "", { type: "audio", audio: { id: "media" } }, depsAudio)
  assert.match(audio.texto, /Transcrevi o seguinte:\n\nCaso INSS para João Silva/)
  assert.equal(audio.opcoes[0].title, "✅ Confirmar")
  assert.equal(audio.opcoes[1].title, "🔁 Reenviar áudio")
  assert.equal(sessoesAudio.get(chave).adminAssistido.etapa, "confirmar_audio")

  const falhaAudio = new Map()
  const depsFalhaAudio = criarDeps(falhaAudio)
  iniciarAtendimentoAssistidoAdmin(from, depsFalhaAudio)
  const respostaFalhaAudio = await processarAtendimentoAssistidoAdmin(from, "", { type: "audio", audio: { id: "media" } }, depsFalhaAudio)
  assert.match(respostaFalhaAudio.texto, /Não consegui processar áudio/)
  assert.ok(respostaFalhaAudio.texto.trim().length > 0)

  const resumo = gerarResumoAdminAssistido({
    adminAssistido: {
      dados: dadosCompletos()
    }
  })
  assert.match(resumo, /Ficha completa do atendimento/)
  assert.match(resumo, /Identificação/)
  assert.match(resumo, /Contato/)
  assert.match(resumo, /Caso/)
  assert.match(resumo, /Pendências/)
  assert.doesNotMatch(resumo, /Copiloto Jurídico|COPILOTO JUR|Não informado/)

  const textosUtf8 = [audio.texto, respostaFalhaAudio.texto, resumo].join("\n")
  assert.doesNotMatch(textosUtf8, padraoMojibake())
  assert.match(textosUtf8, /Área jurídica/)
  assert.match(textosUtf8, /Ficha completa/)

  // Teste: retomada após reinício — clicar "Atendimento com IA" não deve sobrescrever sessão restaurada
  const sessoesRetomada = new Map()
  const depsRetomada = criarDeps(sessoesRetomada)
  iniciarAtendimentoAssistidoAdmin(from, depsRetomada)
  const relato = await processarAtendimentoAssistidoAdmin(
    from,
    "Caso trabalhista para Maria Silva. Empresa Acme Ltda. Demissão sem pagamento de rescisão.",
    { type: "text" },
    depsRetomada
  )
  persistirSessoesAdminAssistidasAgora(sessoesRetomada, { propagarErro: true })

  const sessoesRestauradasRetomada = new Map()
  const resultadoCargaRetomada = carregarSessoesAdminAssistidasPersistidas(sessoesRestauradasRetomada)
  assert.equal(resultadoCargaRetomada.restauradas, 1)
  assert.equal(sessoesRestauradasRetomada.get(chave).adminAssistido.aguardandoConfirmacaoRetomada, true)

  const etapaAntes = sessoesRestauradasRetomada.get(chave).adminAssistido.etapa
  const perguntaAntes = sessoesRestauradasRetomada.get(chave).adminAssistido.perguntaPendente
  const camposAntes = sessoesRestauradasRetomada.get(chave).adminAssistido.camposPerguntados
  const historicoAntes = sessoesRestauradasRetomada.get(chave).adminAssistido.historico.length

  const telaRetomada = iniciarAtendimentoAssistidoAdmin(from, criarDeps(sessoesRestauradasRetomada))
  assert.match(telaRetomada.texto, /Foi encontrado um atendimento em andamento\./)
  assert.match(telaRetomada.texto, /Deseja continuar\?/)
  assert.ok(telaRetomada.opcoes.some(o => o.id === "admin_assistido_retomar_continuar"))
  assert.ok(telaRetomada.opcoes.some(o => o.id === "admin_assistido_retomar_cancelar"))

  const sessoesAposRetomada = sessoesRestauradasRetomada
  assert.equal(sessoesAposRetomada.get(chave).adminAssistido.etapa, etapaAntes)
  assert.equal(sessoesAposRetomada.get(chave).adminAssistido.perguntaPendente, perguntaAntes)
  assert.deepEqual(sessoesAposRetomada.get(chave).adminAssistido.camposPerguntados, camposAntes)
  assert.equal(sessoesAposRetomada.get(chave).adminAssistido.historico.length, historicoAntes)
  assert.equal(sessoesAposRetomada.get(chave).adminAssistido.aguardandoConfirmacaoRetomada, true)

  const continuacaoRetomada = await processarAtendimentoAssistidoAdmin(
    from,
    "admin_assistido_retomar_continuar",
    { type: "text" },
    criarDeps(sessoesAposRetomada)
  )
  assert.doesNotMatch(continuacaoRetomada.texto, /Foi encontrado/)
  assert.equal(sessoesAposRetomada.get(chave).adminAssistido.aguardandoConfirmacaoRetomada, false)
  assert.equal(sessoesAposRetomada.get(chave).adminAssistido.etapa, etapaAntes)

  // Teste: iniciar novo atendimento após cancelar retomada deve criar estado limpo
  const sessoesNovo = new Map()
  const depsNovo = criarDeps(sessoesNovo)
  iniciarAtendimentoAssistidoAdmin(from, depsNovo)
  await processarAtendimentoAssistidoAdmin(
    from,
    "Caso trabalhista para Maria Silva. Empresa Acme Ltda. Demissão sem pagamento de rescisão.",
    { type: "text" },
    depsNovo
  )
  persistirSessoesAdminAssistidasAgora(sessoesNovo, { propagarErro: true })

  const sessoesRestauradasNovo = new Map()
  carregarSessoesAdminAssistidasPersistidas(sessoesRestauradasNovo)
  assert.equal(sessoesRestauradasNovo.get(chave).adminAssistido.aguardandoConfirmacaoRetomada, true)

  const cancelarRetomada = await processarAtendimentoAssistidoAdmin(
    from,
    "admin_assistido_retomar_cancelar",
    { type: "text" },
    criarDeps(sessoesRestauradasNovo)
  )
  assert.equal(sessoesRestauradasNovo.get(chave).adminAssistido, null)

  const novoInicio = iniciarAtendimentoAssistidoAdmin(from, criarDeps(sessoesRestauradasNovo))
  assert.match(novoInicio.texto, /Atendimento Assistido por IA/)
  assert.match(novoInicio.texto, /Descreva o caso livremente/)
  assert.equal(sessoesRestauradasNovo.get(chave).adminAssistido.etapa, "aguardando_relato")
  assert.equal(sessoesRestauradasNovo.get(chave).adminAssistido.camposPerguntados.length, 0)

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log("admin-assisted-ai-hardening.test.js ok")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
