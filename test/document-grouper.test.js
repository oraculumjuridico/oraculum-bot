const assert = require("node:assert/strict")

const {
  GRUPOS_DOCUMENTAIS,
  agruparDocumentosProcessados
} = require("../src/domain/document-grouper")

function doc(tipoDocumento, categoria, subtipo, camposExtraidos, referenciaArquivoOriginal, confianca = 0.9) {
  return {
    tipoDocumento,
    categoria,
    subtipo,
    camposExtraidos,
    confianca,
    referenciaArquivoOriginal
  }
}

function main() {
  assert.ok(GRUPOS_DOCUMENTAIS.includes("rgPares"))
  assert.ok(GRUPOS_DOCUMENTAIS.includes("documentosProcessuais"))

  const documentos = [
    doc("RG frente", "documentos_pessoais", "identidade", { rg: "12.345.678-9", nome: "MARIA" }, "rg-frente.jpg"),
    doc("RG verso", "documentos_pessoais", "identidade", { rg: "12.345.678-9" }, "rg-verso.jpg"),
    doc("RG frente", "documentos_pessoais", "identidade", { rg: "99.999.999-9" }, "rg-frente-sem-verso.jpg"),
    doc("CPF", "documentos_pessoais", "cadastro_pessoa_fisica", { cpf: "123.456.789-09" }, "cpf.jpg"),
    doc("CNH", "documentos_pessoais", "habilitacao", { cpf: "123.456.789-09" }, "cnh.jpg"),
    doc("Certidao de nascimento", "documentos_pessoais", "civil", {}, "certidao-ficticia.jpg"),
    doc("Comprovante de residencia", "documentos_pessoais", "endereco", { nome: "MARIA" }, "luz.jpg"),
    { ...doc("CTPS pagina", "documentos_pessoais", "trabalho", {}, "ctps-a-p2.jpg"), grupoDocumento: "carteira-a", pageNumber: 2 },
    { ...doc("CTPS pagina", "documentos_pessoais", "trabalho", {}, "ctps-a-p1.jpg"), grupoDocumento: "carteira-a", pageNumber: 1 },
    { ...doc("Carteira de trabalho", "documentos_pessoais", "trabalho", { numero: "FICT-2", serie: "S2", uf: "ZZ" }, "ctps-b.jpg"), pageNumber: 1 },
    doc("Holerite", "trabalhista", "remuneracao", { competencia: "05/2026" }, "holerite-05.jpg"),
    doc("Holerite", "trabalhista", "remuneracao", { competencia: "06/2026" }, "holerite-06.jpg"),
    doc("Laudo", "medico", "laudo_medico", { cid: "M54.5" }, "laudo-1.jpg"),
    doc("Laudo", "medico", "laudo_medico", { cid: "F32" }, "laudo-2.jpg"),
    doc("Exame", "medico", "resultado_exame", { data: "01/01/2026" }, "exame.jpg"),
    doc("Receita", "medico", "prescricao", { medico: "DRA ANA" }, "receita.jpg"),
    doc("CNIS", "previdenciario", "extrato_contribuicoes", { nb: "123" }, "cnis.pdf"),
    doc("Carta do INSS", "previdenciario", "comunicacao", { nb: "456" }, "carta.pdf"),
    doc("TRCT", "trabalhista", "rescisao", {}, "trct.pdf"),
    doc("Extrato FGTS", "trabalhista", "fgts", {}, "fgts.pdf"),
    doc("Peticao", "processual", "peca_processual", { numero: "0001234-56.2024.5.02.0001" }, "peticao.pdf"),
    doc("Sentenca", "processual", "ato_judicial", { numero: "0001234-56.2024.5.02.0001" }, "sentenca.pdf"),
    doc("Documento desconhecido", "outros", null, {}, "desconhecido.jpg")
  ]

  const grupos = agruparDocumentosProcessados(documentos)

  assert.equal(grupos.erros.length, 0)
  assert.equal(grupos.documentosPessoais.length, 6)
  assert.ok(grupos.documentosPessoais.some(item => item.tipoDocumento === "Certidao de nascimento"))
  assert.equal(grupos.documentosPessoais.some(item => /ctps|carteira de trabalho/i.test(item.tipoDocumento)), false)
  assert.equal(grupos.documentosPessoais.some(item => /comprovante/i.test(item.tipoDocumento)), false)
  assert.equal(grupos.rgPares.length, 1)
  assert.equal(grupos.rgPares[0].frente.referenciaArquivoOriginal, "rg-frente.jpg")
  assert.equal(grupos.rgPares[0].verso.referenciaArquivoOriginal, "rg-verso.jpg")
  assert.equal(grupos.rgFrentesSemVerso.length, 1)
  assert.equal(grupos.rgFrentesSemVerso[0].referenciaArquivoOriginal, "rg-frente-sem-verso.jpg")
  assert.equal(grupos.rgVersosSemFrente.length, 0)
  assert.ok(grupos.avisos.some(aviso => aviso.code === "DOCUMENT_GROUPER_RG_INCOMPLETE"))

  assert.equal(grupos.comprovantesResidencia.length, 1)
  assert.equal(grupos.ctps.length, 2)
  assert.deepEqual(grupos.ctps[0].documentos.map(item => item.pageNumber), [1, 2])
  assert.equal(grupos.holerites.length, 2)
  assert.deepEqual(grupos.holerites.map(item => item.camposExtraidos.competencia), ["05/2026", "06/2026"])
  assert.equal(grupos.laudos.length, 2)
  assert.equal(grupos.exames.length, 1)
  assert.equal(grupos.receitas.length, 1)
  assert.equal(grupos.documentosPrevidenciarios.length, 2)
  assert.equal(grupos.documentosTrabalhistas.length, 2)
  assert.equal(grupos.documentosTrabalhistas.some(item => item.tipoDocumento === "Holerite"), false)
  assert.equal(grupos.documentosProcessuais.length, 2)
  assert.equal(grupos.outros.length, 1)
  assert.equal(grupos.outros[0].referenciaArquivoOriginal, "desconhecido.jpg")

  const resultadoPipeline = {
    classificacao: {
      tipoDocumento: "Laudo",
      categoria: "medico",
      subtipo: "laudo_medico",
      confianca: 0.88
    },
    extracao: {
      camposExtraidos: { cid: "M75" }
    },
    arquivoOriginal: "pipeline-laudo.jpg"
  }
  const gruposPipeline = agruparDocumentosProcessados([resultadoPipeline])
  assert.equal(gruposPipeline.laudos.length, 1)
  assert.equal(gruposPipeline.laudos[0].tipoDocumento, "Laudo")
  assert.equal(gruposPipeline.laudos[0].camposExtraidos.cid, "M75")
  assert.equal(gruposPipeline.laudos[0].referenciaArquivoOriginal, "pipeline-laudo.jpg")

  const incerta = agruparDocumentosProcessados([
    doc("CTPS pagina", "documentos_pessoais", "trabalho", {}, "origem-ficticia-a.png"),
    doc("CTPS pagina", "documentos_pessoais", "trabalho", {}, "origem-ficticia-b.png")
  ])
  assert.equal(incerta.ctps.length, 2)
  assert.ok(incerta.avisos.some(aviso => aviso.code === "DOCUMENT_GROUPER_CTPS_REVIEW"))

  const invalido = agruparDocumentosProcessados(null)
  assert.equal(invalido.erros[0].code, "DOCUMENT_GROUPER_INPUT_INVALID")
  assert.equal(invalido.documentosPessoais.length, 0)
}

main()
console.log("document-grouper.test.js: ok")
