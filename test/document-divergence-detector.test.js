const assert = require("node:assert/strict")

const {
  criarDocumentRegistry
} = require("../src/domain/document-registry")
const {
  detectarDivergenciasDocumentais
} = require("../src/domain/document-divergence-detector")

const NOW = "2026-07-08T12:00:00.000Z"

function doc({ fileId, tipoDocumento, camposExtraidos = {}, confiancaPorCampo = {} }) {
  return {
    status: "concluido",
    dataProcessamento: NOW,
    arquivo: {
      fileId,
      nome: `${tipoDocumento}.jpg`,
      mimeType: "image/jpeg",
      hash: `hash-${fileId}`,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`
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

function registry(documentos) {
  return criarDocumentRegistry({
    numeroCaso: "ORA-DIV",
    analises: documentos
  }, { now: NOW })
}

function porCampo(resultado, campo) {
  return resultado.divergencias.filter(item => item.campo === campo)
}

function main() {
  const cpfDiferente = detectarDivergenciasDocumentais(registry([
    doc({
      fileId: "rg",
      tipoDocumento: "RG frente",
      camposExtraidos: { cpf: "123.456.789-09" },
      confiancaPorCampo: { cpf: 0.94 }
    }),
    doc({
      fileId: "cpf",
      tipoDocumento: "CPF",
      camposExtraidos: { cpf: "98745678909" },
      confiancaPorCampo: { cpf: 0.9 }
    })
  ]))
  assert.equal(porCampo(cpfDiferente, "cpf").length, 1)
  assert.equal(porCampo(cpfDiferente, "cpf")[0].gravidade, "ALTA")
  assert.equal(cpfDiferente.inconsistenciasCriticas.length, 1)
  assert.match(cpfDiferente.resumo, /1 criticas/)

  const nomeComAcento = detectarDivergenciasDocumentais(registry([
    doc({ fileId: "rg", tipoDocumento: "RG frente", camposExtraidos: { nome: "José da Silva" } }),
    doc({ fileId: "ctps", tipoDocumento: "CTPS", camposExtraidos: { nome: "JOSE DA SILVA" } })
  ]))
  assert.equal(nomeComAcento.divergencias.length, 0)
  assert.match(nomeComAcento.resumo, /Nenhuma divergencia/)

  const datasEquivalentes = detectarDivergenciasDocumentais(registry([
    doc({ fileId: "rg", tipoDocumento: "RG frente", camposExtraidos: { dataNascimento: "02/01/1990" } }),
    doc({ fileId: "certidao", tipoDocumento: "Certidao de nascimento", camposExtraidos: { data_nascimento: "1990-01-02" } })
  ]))
  assert.equal(datasEquivalentes.divergencias.length, 0)

  const datasDiferentes = detectarDivergenciasDocumentais(registry([
    doc({
      fileId: "rg",
      tipoDocumento: "RG frente",
      camposExtraidos: { dataNascimento: "02/01/1990" },
      confiancaPorCampo: { dataNascimento: 0.88 }
    }),
    doc({
      fileId: "certidao",
      tipoDocumento: "Certidao de nascimento",
      camposExtraidos: { data_nascimento: "03/01/1990" },
      confiancaPorCampo: { data_nascimento: 0.86 }
    })
  ]))
  assert.equal(porCampo(datasDiferentes, "dataNascimento").length, 1)
  assert.equal(porCampo(datasDiferentes, "dataNascimento")[0].gravidade, "ALTA")
  assert.equal(porCampo(datasDiferentes, "dataNascimento")[0].confianca, 0.87)

  const enderecoDiferente = detectarDivergenciasDocumentais(registry([
    doc({ fileId: "comprovante-1", tipoDocumento: "Comprovante", camposExtraidos: { endereco: "Rua A, 100", cidade: "Recife" } }),
    doc({ fileId: "comprovante-2", tipoDocumento: "Comprovante", camposExtraidos: { endereco: "Rua B, 200", cidade: "Recife" } })
  ]))
  assert.equal(porCampo(enderecoDiferente, "endereco").length, 1)
  assert.equal(porCampo(enderecoDiferente, "endereco")[0].gravidade, "MEDIA")

  const empresaDiferente = detectarDivergenciasDocumentais(registry([
    doc({ fileId: "holerite", tipoDocumento: "Holerite", camposExtraidos: { empresa: "ACME LTDA" } }),
    doc({ fileId: "trct", tipoDocumento: "TRCT", camposExtraidos: { empregador: "Outra Empresa S.A." } })
  ]))
  assert.equal(porCampo(empresaDiferente, "empresa").length, 1)
  assert.equal(porCampo(empresaDiferente, "empresa")[0].tipo, "trabalhista")

  const semDivergencias = detectarDivergenciasDocumentais(registry([
    doc({
      fileId: "rg",
      tipoDocumento: "RG frente",
      camposExtraidos: {
        nome: "Maria Souza",
        cpf: "111.222.333-44",
        cidade: "Sao Paulo",
        uf: "SP"
      }
    }),
    doc({
      fileId: "cpf",
      tipoDocumento: "CPF",
      camposExtraidos: {
        nome_completo: "MARIA SOUZA",
        cpf: "11122233344",
        municipio: "São Paulo",
        estado: "sp"
      }
    })
  ]))
  assert.equal(semDivergencias.divergencias.length, 0)
  assert.equal(semDivergencias.inconsistenciasCriticas.length, 0)

  const vazio = detectarDivergenciasDocumentais({ documentos: [] })
  assert.equal(vazio.divergencias.length, 0)
  assert.equal(vazio.avisos[0].code, "DOCUMENT_DIVERGENCE_EMPTY_REGISTRY")
}

main()
console.log("document-divergence-detector.test.js: ok")
