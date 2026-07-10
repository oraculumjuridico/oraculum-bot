const assert = require("node:assert/strict")

const {
  criarDocumentRegistry,
  atualizarDocumentRegistry,
  registrarPdfs
} = require("../src/domain/document-registry")
const {
  criarDossieJuridico
} = require("../src/domain/legal-dossier")

const NOW = "2026-07-08T12:00:00.000Z"

function doc({ fileId, tipoDocumento, camposExtraidos = {}, confiancaPorCampo = {}, dataProcessamento = NOW }) {
  return {
    status: "concluido",
    dataProcessamento,
    arquivo: {
      fileId,
      nome: `${tipoDocumento}.jpg`,
      mimeType: "image/jpeg",
      hash: `hash-${fileId}`,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      dataUpload: dataProcessamento
    },
    hash: `hash-${fileId}`,
    pipeline: {
      classificacao: {
        tipoDocumento,
        categoria: "documentos",
        confianca: 0.9
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

function baseRegistry(documentos, area = "trabalhista") {
  const registry = criarDocumentRegistry({
    numeroCaso: "ORA-013",
    analises: documentos
  }, { now: NOW })
  registry.metadados.area_juridica = area
  registry.metadados.tipo_de_caso = "trab_demissao"
  registry.metadados.pastaDriveLink = "https://drive.google.com/drive/folders/pasta"
  return registry
}

function main() {
  const completo = registrarPdfs(baseRegistry([
    doc({
      fileId: "rg",
      tipoDocumento: "RG frente",
      camposExtraidos: {
        nome: "Maria da Silva",
        cpf: "123.456.789-09",
        dataNascimento: "1990-01-02",
        cidade: "Recife",
        uf: "PE"
      }
    }),
    doc({ fileId: "cpf", tipoDocumento: "CPF", camposExtraidos: { cpf: "12345678909" } }),
    doc({ fileId: "ctps", tipoDocumento: "CTPS", camposExtraidos: { empresa: "ACME LTDA" } }),
    doc({ fileId: "holerite", tipoDocumento: "Holerite", camposExtraidos: { salario: "R$ 2.000,00" } }),
    doc({ fileId: "trct", tipoDocumento: "TRCT" })
  ]), [{
    tipo: "DocumentosTrabalhistas",
    arquivo: "DocumentosTrabalhistas.pdf",
    paginas: 5,
    fileId: "pdf-trab",
    webViewLink: "https://drive.google.com/file/d/pdf-trab/view",
    originais: [{ fileId: "ctps" }, { fileId: "holerite" }]
  }], { now: "2026-07-08T13:00:00.000Z" })

  const dossieCompleto = criarDossieJuridico({
    registry: completo,
    contatoHubSpot: {
      id: "contact-1",
      properties: {
        firstname: "Maria HubSpot",
        phone: "5581999990000"
      }
    },
    negocioHubSpot: {
      id: "deal-1",
      properties: {
        numero_de_caso: "TRAB.260708.001",
        area_juridica: "Trabalhista",
        tipo_de_caso: "trab_demissao",
        hubspot_owner_id: "90513737",
        pasta_drive: "https://drive.example/fallback"
      }
    }
  })

  assert.equal(dossieCompleto.cliente.nome, "Maria HubSpot")
  assert.equal(dossieCompleto.cliente.cpf, "123.456.789-09")
  assert.equal(dossieCompleto.cliente.dataNascimento, "1990-01-02")
  assert.deepEqual(dossieCompleto.cliente.telefones, ["5581999990000"])
  assert.equal(dossieCompleto.caso.area, "Trabalhista")
  assert.equal(dossieCompleto.caso.numeroHubSpot, "TRAB.260708.001")
  assert.equal(dossieCompleto.documentacao.percentual, 100)
  assert.equal(dossieCompleto.divergencias.length, 0)
  assert.equal(dossieCompleto.pdfs.length, 1)
  assert.equal(dossieCompleto.pdfs[0].drive.fileId, "pdf-trab")
  assert.equal(dossieCompleto.links.pastaDrive, "https://drive.google.com/drive/folders/pasta")
  assert.equal(dossieCompleto.links.pdfs[0].webViewLink.includes("pdf-trab"), true)
  assert.equal(dossieCompleto.links.documentos.length, 5)
  assert.ok(dossieCompleto.cronologia.some(item => item.tipo === "processamento_documento"))

  const vazio = criarDossieJuridico({
    registry: { documentos: [], pdfs: [], metadados: { area_juridica: "trabalhista" } }
  })
  assert.equal(vazio.documentacao.percentual, 0)
  assert.deepEqual(vazio.documentacao.recebidos, [])
  assert.ok(vazio.copiloto.riscos.includes("documentacao_incompleta"))
  assert.equal(vazio.links.documentos.length, 0)

  const pendente = criarDossieJuridico({
    registry: baseRegistry([
      doc({ fileId: "rg", tipoDocumento: "RG frente" }),
      doc({ fileId: "cpf", tipoDocumento: "CPF" })
    ])
  })
  assert.equal(pendente.documentacao.percentual, 40)
  assert.deepEqual(pendente.copiloto.documentosSugeridos, ["CTPS", "Holerites", "TRCT"])

  const divergente = criarDossieJuridico({
    registry: baseRegistry([
      doc({ fileId: "rg", tipoDocumento: "RG frente", camposExtraidos: { cpf: "123.456.789-09" } }),
      doc({ fileId: "cpf", tipoDocumento: "CPF", camposExtraidos: { cpf: "987.654.321-00" } })
    ])
  })
  assert.equal(divergente.divergencias.length, 1)
  assert.ok(divergente.copiloto.riscos.includes("divergencia_critica"))
  assert.match(divergente.copiloto.observacoes.join(" "), /validacao manual/)

  const comVersoes = atualizarDocumentRegistry(
    baseRegistry([
      doc({ fileId: "rg", tipoDocumento: "Documento desconhecido", dataProcessamento: "2026-07-08T10:00:00.000Z" })
    ]),
    {
      documentos: [{
        fileId: "rg",
        nome: "RG reprocessado.jpg",
        hash: "hash-rg-novo",
        tipoDocumento: "RG frente",
        pipeline: {
          classificacao: { tipoDocumento: "RG frente", categoria: "documentos", confianca: 0.95 },
          extracao: { camposExtraidos: { nome: "Maria" }, avisos: [], erros: [] }
        },
        dataProcessamento: "2026-07-08T15:00:00.000Z"
      }]
    },
    { now: "2026-07-08T15:00:00.000Z" }
  )
  const dossieVersoes = criarDossieJuridico({ registry: comVersoes })
  assert.equal(dossieVersoes.links.documentos[0].versaoAtual, 2)
  assert.equal(dossieVersoes.cronologia.filter(item => item.documento.fileId === "rg" && item.tipo === "processamento_documento").length, 2)
}

main()
console.log("legal-dossier.test.js: ok")
