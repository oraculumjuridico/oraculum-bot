const assert = require("node:assert/strict")

const {
  criarDocumentRegistry,
  atualizarDocumentRegistry
} = require("../src/domain/document-registry")
const {
  gerarChecklistDocumental
} = require("../src/domain/document-checklist")

const NOW = "2026-07-08T12:00:00.000Z"

function doc({ fileId, tipoDocumento, hash, camposExtraidos = {}, status = "concluido", dataProcessamento = NOW }) {
  return {
    status,
    dataProcessamento,
    arquivo: {
      fileId,
      nome: `${tipoDocumento}.jpg`,
      mimeType: "image/jpeg",
      hash: hash || `hash-${fileId}`,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`
    },
    hash: hash || `hash-${fileId}`,
    pipeline: {
      classificacao: {
        tipoDocumento,
        categoria: "documentos",
        confianca: 0.9
      },
      extracao: {
        camposExtraidos,
        confiancaPorCampo: {},
        avisos: [],
        erros: []
      }
    },
    avisos: [],
    erros: status === "erro" ? [{ code: "DOCUMENT_ERROR", message: "falha" }] : []
  }
}

function registry(area, documentos) {
  const estado = criarDocumentRegistry({
    numeroCaso: "ORA-CHECK",
    analises: documentos
  }, { now: NOW })
  estado.metadados.area_juridica = area
  return estado
}

function itens(lista) {
  return lista.map(item => item.item)
}

function main() {
  const trabalhistaCompleto = registry("trabalhista", [
    doc({ fileId: "rg", tipoDocumento: "RG frente" }),
    doc({ fileId: "cpf", tipoDocumento: "CPF" }),
    doc({ fileId: "ctps", tipoDocumento: "CTPS" }),
    doc({ fileId: "holerite", tipoDocumento: "Holerite" }),
    doc({ fileId: "trct", tipoDocumento: "TRCT" }),
    doc({ fileId: "contrato", tipoDocumento: "Contrato de trabalho" })
  ])
  const checklistTrabalhistaCompleto = gerarChecklistDocumental(trabalhistaCompleto)
  assert.equal(checklistTrabalhistaCompleto.area, "trabalhista")
  assert.equal(checklistTrabalhistaCompleto.percentualCompleto, 100)
  assert.deepEqual(itens(checklistTrabalhistaCompleto.pendentes), [])
  assert.deepEqual(itens(checklistTrabalhistaCompleto.opcionaisRecebidos), ["Contrato de trabalho"])
  assert.match(checklistTrabalhistaCompleto.resumo, /Documentacao completa/)

  const trabalhistaIncompleto = registry("trabalhista", [
    doc({ fileId: "rg", tipoDocumento: "RG verso" }),
    doc({ fileId: "cpf", tipoDocumento: "CPF" }),
    doc({ fileId: "holerite", tipoDocumento: "Holerite" })
  ])
  const checklistTrabalhistaIncompleto = gerarChecklistDocumental(trabalhistaIncompleto)
  assert.equal(checklistTrabalhistaIncompleto.percentualCompleto, 60)
  assert.deepEqual(itens(checklistTrabalhistaIncompleto.pendentes), ["CTPS", "TRCT"])
  assert.doesNotMatch(checklistTrabalhistaIncompleto.resumo, /RG/)
  assert.match(checklistTrabalhistaIncompleto.resumo, /Restam CTPS e TRCT/)

  const inssCompleto = registry("INSS previdenciario", [
    doc({ fileId: "rg", tipoDocumento: "RG frente" }),
    doc({ fileId: "cpf", tipoDocumento: "CPF" }),
    doc({ fileId: "cnis", tipoDocumento: "CNIS" }),
    doc({ fileId: "laudo", tipoDocumento: "Laudo" }),
    doc({ fileId: "receita", tipoDocumento: "Receita" }),
    doc({ fileId: "exame", tipoDocumento: "Exame" })
  ])
  const checklistInss = gerarChecklistDocumental(inssCompleto)
  assert.equal(checklistInss.area, "inss")
  assert.equal(checklistInss.percentualCompleto, 100)
  assert.deepEqual(itens(checklistInss.opcionaisRecebidos), ["Laudos", "Receitas", "Exames"])

  const familia = registry("familia", [
    doc({ fileId: "rg", tipoDocumento: "RG frente" }),
    doc({ fileId: "cpf", tipoDocumento: "CPF" }),
    doc({ fileId: "nascimento", tipoDocumento: "Certidao de nascimento" })
  ])
  const checklistFamilia = gerarChecklistDocumental(familia)
  assert.equal(checklistFamilia.area, "familia")
  assert.equal(checklistFamilia.percentualCompleto, 100)
  assert.deepEqual(itens(checklistFamilia.opcionaisRecebidos), ["Certidao nascimento"])
  assert.deepEqual(itens(checklistFamilia.opcionaisPendentes), ["Certidao casamento"])

  const comDuplicado = atualizarDocumentRegistry(trabalhistaCompleto, {
    documentos: [{
      fileId: "rg-copia",
      nome: "RG copia.jpg",
      hash: "hash-rg",
      tipoDocumento: "RG frente"
    }]
  }, { now: "2026-07-08T13:00:00.000Z" })
  const checklistDuplicado = gerarChecklistDocumental(comDuplicado)
  assert.equal(checklistDuplicado.percentualCompleto, 100)
  assert.equal(checklistDuplicado.duplicados.length, 2)
  assert.deepEqual(itens(checklistDuplicado.pendentes), [])

  const comVencido = registry("consumidor", [
    doc({ fileId: "rg", tipoDocumento: "RG frente", camposExtraidos: { validade: "2025-01-01" } }),
    doc({ fileId: "cpf", tipoDocumento: "CPF" }),
    doc({ fileId: "contrato", tipoDocumento: "Contrato", camposExtraidos: { data_vencimento: "2030-01-01" } })
  ])
  const checklistVencido = gerarChecklistDocumental(comVencido, { today: "2026-07-08" })
  assert.equal(checklistVencido.percentualCompleto, 100)
  assert.equal(checklistVencido.vencidos.length, 1)
  assert.equal(checklistVencido.vencidos[0].item, null)
  assert.equal(checklistVencido.vencidos[0].tipoDocumento, "RG frente")

  const multiplasVersoes = atualizarDocumentRegistry(
    registry("trabalhista", [
      doc({ fileId: "rg", tipoDocumento: "Documento desconhecido" }),
      doc({ fileId: "cpf", tipoDocumento: "CPF" })
    ]),
    {
      documentos: [{
        fileId: "rg",
        nome: "RG reprocessado.jpg",
        hash: "hash-rg-novo",
        tipoDocumento: "RG frente",
        pipeline: {
          classificacao: { tipoDocumento: "RG frente", categoria: "documentos", confianca: 0.95 },
          extracao: { camposExtraidos: {}, avisos: [], erros: [] }
        }
      }]
    },
    { now: "2026-07-08T14:00:00.000Z" }
  )
  const checklistVersoes = gerarChecklistDocumental(multiplasVersoes)
  assert.ok(itens(checklistVersoes.recebidos).includes("RG"))
  assert.equal(checklistVersoes.invalidos.length, 0)

  const vazio = gerarChecklistDocumental({ documentos: [], metadados: { area_juridica: "trabalhista" } })
  assert.equal(vazio.percentualCompleto, 0)
  assert.deepEqual(itens(vazio.pendentes), ["RG", "CPF", "CTPS", "Holerites", "TRCT"])
  assert.match(vazio.resumo, /0 foram recebidos/)
}

main()
console.log("document-checklist.test.js: ok")
