const assert = require("node:assert/strict")

const {
  criarDocumentRegistry,
  registrarPdfs
} = require("../src/domain/document-registry")
const {
  montarDossieJuridicoAdminWhatsApp
} = require("../src/domain/admin-legal-dossier-ui")

const NOW = "2026-07-08T12:00:00.000Z"

function doc({ fileId, tipoDocumento, camposExtraidos = {} }) {
  return {
    status: "concluido",
    dataProcessamento: NOW,
    arquivo: {
      fileId,
      nome: `${tipoDocumento}.jpg`,
      mimeType: "image/jpeg",
      hash: `hash-${fileId}`,
      webViewLink: `https://drive.example/${fileId}`,
      dataUpload: NOW
    },
    hash: `hash-${fileId}`,
    pipeline: {
      classificacao: {
        tipoDocumento,
        categoria: "documentos",
        confianca: 0.95
      },
      extracao: {
        camposExtraidos,
        textoOCR: "CONTEUDO OCR QUE NAO PODE APARECER",
        laudoCompleto: "LAUDO COMPLETO QUE NAO PODE APARECER",
        avisos: [],
        erros: []
      }
    },
    avisos: [],
    erros: []
  }
}

function registryTrabalhista(documentos = []) {
  const registry = criarDocumentRegistry({
    numeroCaso: "TRAB.260708.001",
    analises: documentos
  }, { now: NOW })
  registry.metadados.area_juridica = "Trabalhista"
  registry.metadados.tipo_de_caso = "Verbas rescisorias"
  return registry
}

function itemComRegistry(registry) {
  return {
    from: "5581999990000",
    u: {
      nome: "Maria Silva",
      cpf: "123.456.789-09",
      numeroCaso: "TRAB.260708.001",
      area: "Trabalhista",
      tipo: "Verbas rescisorias",
      documentRegistry: registry
    }
  }
}

function main() {
  const semDocumentos = montarDossieJuridicoAdminWhatsApp(itemComRegistry(registryTrabalhista([])))
  assert.equal(semDocumentos, "")

  const parcial = montarDossieJuridicoAdminWhatsApp(itemComRegistry(registryTrabalhista([
    doc({ fileId: "rg", tipoDocumento: "RG frente", camposExtraidos: { nome: "Maria Silva", cpf: "123.456.789-09" } }),
    doc({ fileId: "cpf", tipoDocumento: "CPF", camposExtraidos: { cpf: "12345678909" } })
  ])))
  assert.match(parcial, /📁 \*Dossiê Jurídico\*/)
  assert.match(parcial, /👤 \*Cliente:\*\nMaria Silva\n123\.456\.789-09/)
  assert.match(parcial, /✅ Recebidos: 2/)
  assert.match(parcial, /❌ Pendentes: 3/)
  assert.match(parcial, /📊 Completo: 40%/)
  assert.match(parcial, /Nenhum PDF gerado/)
  assert.match(parcial, /Solicitar: CTPS, Holerites, TRCT/)
  assert.doesNotMatch(parcial, /CONTEUDO OCR/)
  assert.doesNotMatch(parcial, /LAUDO COMPLETO/)

  const completoRegistry = registrarPdfs(registryTrabalhista([
    doc({ fileId: "rg", tipoDocumento: "RG frente", camposExtraidos: { nome: "Maria Silva", cpf: "123.456.789-09" } }),
    doc({ fileId: "cpf", tipoDocumento: "CPF", camposExtraidos: { cpf: "12345678909" } }),
    doc({ fileId: "ctps", tipoDocumento: "CTPS" }),
    doc({ fileId: "holerite", tipoDocumento: "Holerite" }),
    doc({ fileId: "trct", tipoDocumento: "TRCT" })
  ]), [{
    tipo: "Documentos trabalhistas",
    arquivo: "documentos-trabalhistas.pdf",
    fileId: "pdf-1",
    webViewLink: "https://drive.example/pdf-1"
  }], { now: NOW })
  const completo = montarDossieJuridicoAdminWhatsApp(itemComRegistry(completoRegistry))
  assert.match(completo, /✅ Recebidos: 5/)
  assert.match(completo, /❌ Pendentes: 0/)
  assert.match(completo, /📊 Completo: 100%/)
  assert.match(completo, /documentos-trabalhistas\.pdf: https:\/\/drive\.example\/pdf-1/)

  const divergente = montarDossieJuridicoAdminWhatsApp(itemComRegistry(registryTrabalhista([
    doc({ fileId: "rg", tipoDocumento: "RG frente", camposExtraidos: { cpf: "123.456.789-09" } }),
    doc({ fileId: "cpf", tipoDocumento: "CPF", camposExtraidos: { cpf: "987.654.321-00" } })
  ])))
  assert.match(divergente, /⚠️ \*Divergências\*/)
  assert.match(divergente, /cpf \(ALTA\)/)
  assert.doesNotMatch(divergente, /987\.654\.321-00/)

  console.log("admin-legal-dossier-ui.test.js: ok")
}

main()
