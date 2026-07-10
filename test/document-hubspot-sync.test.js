const assert = require("node:assert/strict")

const {
  criarDocumentRegistry,
  atualizarDocumentRegistry
} = require("../src/domain/document-registry")
const {
  BLOCKED_FIELDS,
  planejarSincronizacaoDocumentalHubSpot,
  sincronizarDocumentosHubSpot
} = require("../src/domain/document-hubspot-sync")

const NOW = "2026-07-08T12:00:00.000Z"

function analiseDocumento({ fileId, camposExtraidos, confiancaPorCampo = {}, tipoDocumento = "Documento pessoal" }) {
  return {
    status: "concluido",
    dataProcessamento: NOW,
    arquivo: {
      fileId,
      nome: `${fileId}.jpg`,
      mimeType: "image/jpeg",
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      hash: `hash-${fileId}`
    },
    pipeline: {
      preprocessamento: { avisos: [], erros: [] },
      ocr: {
        textoCompleto: "OCR bruto nao pode ir ao HubSpot",
        paginasProcessadas: 1,
        avisos: [],
        erros: []
      },
      classificacao: {
        tipoDocumento,
        categoria: "documentos_pessoais",
        confianca: 0.92
      },
      extracao: {
        camposExtraidos,
        confiancaPorCampo,
        avisos: [],
        erros: []
      }
    },
    avisos: [],
    erros: []
  }
}

async function main() {
  assert.equal(BLOCKED_FIELDS.has("rg"), true)
  assert.equal(BLOCKED_FIELDS.has("cid"), true)

  const registry = criarDocumentRegistry({
    numeroCaso: "ORA-010",
    analises: [
      analiseDocumento({
        fileId: "doc-identidade",
        camposExtraidos: {
          nome: "Maria da Silva",
          cpf: "123.456.789-09",
          data_nascimento: "1990-01-02",
          telefone: "5511999999999",
          telefone_validado: true,
          email: "maria@example.com",
          email_validado: true,
          cidade: "Campinas",
          uf: "SP",
          rg: "12.345.678-9",
          orgao_emissor: "SSP",
          texto_ocr: "texto bruto"
        },
        confiancaPorCampo: {
          nome: 0.94,
          cpf: 0.93,
          data_nascimento: 0.91,
          telefone: 0.9,
          email: 0.89,
          cidade: 0.88,
          uf: 0.88,
          rg: 0.99
        }
      })
    ]
  }, { now: NOW })

  registry.metadados.area_juridica = "INSS"
  registry.metadados.tipo_de_caso = "inss_incapacidade"
  registry.metadados.urgencia = "alta"
  registry.metadados.prioridade = "alta"
  registry.metadados.pasta_drive = "https://drive.google.com/drive/folders/pasta-caso"

  const contato = {
    id: "contact-1",
    properties: {
      firstname: "",
      cpf_do_cliente: "",
      date_of_birth: "",
      phone: "",
      email: "",
      city: "",
      state: ""
    }
  }
  const negocio = {
    id: "deal-1",
    properties: {
      area_juridica: "",
      tipo_de_caso: "",
      resumo_cliente: "",
      hs_priority: "",
      urgencia: "",
      pasta_drive: ""
    }
  }

  const plano = planejarSincronizacaoDocumentalHubSpot({ registry, contato, negocio })
  assert.deepEqual(plano.contato.props, {
    city: "Campinas",
    cpf_do_cliente: "123.456.789-09",
    date_of_birth: "1990-01-02",
    email: "maria@example.com",
    firstname: "Maria da Silva",
    phone: "5511999999999",
    state: "SP"
  })
  assert.equal("rg" in plano.contato.props, false)
  assert.equal("orgao_emissor" in plano.contato.props, false)
  assert.equal("texto_ocr" in plano.contato.props, false)
  assert.deepEqual(plano.negocio.props, {
    area_juridica: "INSS",
    hs_priority: "high",
    pasta_drive: "https://drive.google.com/drive/folders/pasta-caso",
    resumo_cliente: "Documentos recebidos: 1. Pendencias: 0. Divergencias: 0.",
    tipo_de_caso: "inss_incapacidade",
    urgencia: "Alta"
  })
  assert.ok(plano.auditoria.every(item =>
    Object.hasOwn(item, "campo") &&
    Object.hasOwn(item, "valorAnterior") &&
    Object.hasOwn(item, "valorNovo") &&
    Object.hasOwn(item, "origemDocumental") &&
    Object.hasOwn(item, "confianca")
  ))

  const chamadas = []
  const sincronizado = await sincronizarDocumentosHubSpot(
    { registry, contato, negocio },
    {
      hsAtualizarContato: async (id, props) => {
        chamadas.push(["contato", id, props])
        return id
      },
      hsAtualizarNegocio: async (id, props) => {
        chamadas.push(["negocio", id, props])
        return id
      }
    },
    { now: "2026-07-08T13:00:00.000Z" }
  )

  assert.equal(chamadas.length, 2)
  assert.equal(chamadas[0][0], "contato")
  assert.equal(chamadas[1][0], "negocio")
  assert.equal(sincronizado.auditoria.length, plano.auditoria.length)

  const idempotente = await sincronizarDocumentosHubSpot(
    { registry: sincronizado.registry, contato, negocio },
    {
      hsAtualizarContato: async () => {
        throw new Error("contato nao deveria sincronizar duas vezes")
      },
      hsAtualizarNegocio: async () => {
        throw new Error("negocio nao deveria sincronizar duas vezes")
      }
    }
  )
  assert.equal(idempotente.plano.contato.idempotente, true)
  assert.equal(idempotente.plano.negocio.idempotente, true)

  const baixaConfianca = atualizarDocumentRegistry(registry, {
    documentos: [{
      fileId: "doc-cidade-baixa",
      nome: "cidade-baixa.jpg",
      hash: "hash-cidade-baixa",
      tipoDocumento: "Comprovante",
      categoria: "documentos_pessoais",
      pipeline: {
        classificacao: { tipoDocumento: "Comprovante", categoria: "documentos_pessoais", confianca: 0.4 },
        extracao: {
          camposExtraidos: { cidade: "Sorocaba" },
          confiancaPorCampo: { cidade: 0.4 },
          avisos: [],
          erros: []
        }
      }
    }]
  }, { now: "2026-07-08T14:00:00.000Z" })
  const planoBaixa = planejarSincronizacaoDocumentalHubSpot({
    registry: baixaConfianca,
    contato: { id: "contact-2", properties: { city: "Campinas" } },
    negocio
  })
  assert.equal(planoBaixa.contato.props.city, undefined)
  assert.ok(planoBaixa.bloqueados.some(item => item.campo === "city" && item.motivo === "regra_atualizacao"))

  const manual = planejarSincronizacaoDocumentalHubSpot({
    registry,
    contato: {
      id: "contact-3",
      properties: { cpf_do_cliente: "000.000.000-00" },
      camposValidadosManualmente: ["cpf_do_cliente"]
    },
    negocio
  })
  assert.equal(manual.contato.props.cpf_do_cliente, undefined)
  assert.ok(manual.bloqueados.some(item => item.campo === "cpf_do_cliente" && item.motivo === "manual_validado"))

  const telefoneNaoValidado = criarDocumentRegistry({
    analises: [
      analiseDocumento({
        fileId: "doc-telefone-nao-validado",
        camposExtraidos: {
          telefone: "5511888888888",
          email: "sem-validacao@example.com"
        },
        confiancaPorCampo: {
          telefone: 0.99,
          email: 0.99
        }
      })
    ]
  }, { now: NOW })
  const planoSemValidacao = planejarSincronizacaoDocumentalHubSpot({
    registry: telefoneNaoValidado,
    contato,
    negocio
  })
  assert.equal(planoSemValidacao.contato.props.phone, undefined)
  assert.equal(planoSemValidacao.contato.props.email, undefined)

  const reprocessado = atualizarDocumentRegistry(registry, {
    documentos: [{
      fileId: "doc-identidade",
      nome: "doc-identidade-reprocessado.jpg",
      hash: "hash-doc-identidade",
      tipoDocumento: "Documento pessoal",
      categoria: "documentos_pessoais",
      pipeline: {
        classificacao: { tipoDocumento: "Documento pessoal", categoria: "documentos_pessoais", confianca: 0.95 },
        extracao: {
          camposExtraidos: {
            nome: "Maria Aparecida da Silva",
            telefone: "5511999999999",
            telefone_validado: true
          },
          confiancaPorCampo: { nome: 0.96, telefone: 0.96 },
          avisos: [],
          erros: []
        }
      }
    }]
  }, { now: "2026-07-08T15:00:00.000Z" })
  const planoReprocessado = planejarSincronizacaoDocumentalHubSpot({
    registry: reprocessado,
    contato: {
      id: "contact-4",
      properties: { firstname: "Maria da Silva", phone: "5511999999999" }
    },
    negocio
  })
  assert.equal(planoReprocessado.contato.props.firstname, "Maria Aparecida da Silva")
  assert.equal(planoReprocessado.contato.props.phone, undefined)
}

main()
  .then(() => console.log("document-hubspot-sync.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
