const assert = require("node:assert/strict")

const {
  CAMPOS_POR_DOCUMENTO,
  extrairDadosDocumento,
  resolverFamiliaDocumento
} = require("../src/domain/document-extractor")

function assertCampo(resultado, campo, valorEsperado) {
  assert.equal(resultado.camposExtraidos[campo], valorEsperado)
  assert.equal(typeof resultado.confiancaPorCampo[campo], "number")
  assert.ok(resultado.confiancaPorCampo[campo] > 0)
  assert.equal(resultado.camposNaoEncontrados.includes(campo), false)
}

function main() {
  assert.equal(resolverFamiliaDocumento("RG frente"), "rg")
  assert.equal(resolverFamiliaDocumento("Sentenca", { categoria: "processual" }), "processo")
  assert.deepEqual(CAMPOS_POR_DOCUMENTO.rg, [
    "nome",
    "cpf",
    "rg",
    "dataNascimento",
    "filiacao",
    "orgaoEmissor",
    "uf",
    "dataEmissao"
  ])

  const rg = extrairDadosDocumento({
    tipoDocumento: "RG frente",
    textoOCR: `
      Registro Geral RG: 12.345.678-9
      Nome: MARIA DA SILVA
      CPF: 123.456.789-09
      Data de nascimento: 10/02/1985
      Filiacao: JOAO DA SILVA E ANA DA SILVA
      Orgao emissor: SSP/SP
      UF: SP
      Data de emissao: 05/03/2010
    `
  })
  assertCampo(rg, "nome", "MARIA DA SILVA")
  assertCampo(rg, "cpf", "123.456.789-09")
  assertCampo(rg, "rg", "12.345.678-9")
  assertCampo(rg, "dataNascimento", "10/02/1985")
  assertCampo(rg, "filiacao", "JOAO DA SILVA E ANA DA SILVA")
  assertCampo(rg, "orgaoEmissor", "SSP/SP")
  assertCampo(rg, "uf", "SP")
  assertCampo(rg, "dataEmissao", "05/03/2010")
  assert.equal(rg.erros.length, 0)

  const cnh = extrairDadosDocumento({
    tipoDocumento: "CNH",
    textoOCR: `
      Carteira Nacional de Habilitacao
      Nome: JOSE PEREIRA
      CPF: 111.222.333-44
      Registro: 98765432100
      Categoria: AB
      Validade: 30/09/2030
      Primeira habilitacao: 12/01/2005
    `
  })
  assertCampo(cnh, "nome", "JOSE PEREIRA")
  assertCampo(cnh, "cpf", "111.222.333-44")
  assertCampo(cnh, "registro", "98765432100")
  assertCampo(cnh, "categoria", "AB")
  assertCampo(cnh, "validade", "30/09/2030")
  assertCampo(cnh, "primeiraHabilitacao", "12/01/2005")

  const ctps = extrairDadosDocumento({
    tipoDocumento: "CTPS",
    textoOCR: "Carteira de Trabalho CTPS: 1234567\nSerie: 0040\nUF: RJ"
  })
  assertCampo(ctps, "numero", "1234567")
  assertCampo(ctps, "serie", "0040")
  assertCampo(ctps, "uf", "RJ")

  const certidao = extrairDadosDocumento({
    tipoDocumento: "Certidao de nascimento",
    textoOCR: `
      Certidao de nascimento
      Nome: PEDRO ALVES
      Filiacao: CARLOS ALVES E RENATA ALVES
      Data de nascimento: 01/01/2020
      Livro: A12
      Folha: 45
      Termo: 9988
    `
  })
  assertCampo(certidao, "nome", "PEDRO ALVES")
  assertCampo(certidao, "filiacao", "CARLOS ALVES E RENATA ALVES")
  assertCampo(certidao, "dataNascimento", "01/01/2020")
  assertCampo(certidao, "livro", "A12")
  assertCampo(certidao, "folha", "45")
  assertCampo(certidao, "termo", "9988")

  const holerite = extrairDadosDocumento({
    tipoDocumento: "Holerite",
    textoOCR: `
      Empresa: ACME SERVICOS LTDA
      Competencia: 05/2026
      Cargo: ANALISTA JURIDICO
      Salario bruto: R$ 5.500,00
      Salario liquido: R$ 4.200,50
    `
  })
  assertCampo(holerite, "empresa", "ACME SERVICOS LTDA")
  assertCampo(holerite, "competencia", "05/2026")
  assertCampo(holerite, "cargo", "ANALISTA JURIDICO")
  assertCampo(holerite, "salarioBruto", "R$ 5.500,00")
  assertCampo(holerite, "salarioLiquido", "R$ 4.200,50")

  const cnis = extrairDadosDocumento({
    tipoDocumento: "CNIS",
    textoOCR: `
      Cadastro Nacional de Informacoes Sociais
      NB: 123.456.789-0
      DER: 10/01/2024
      DIB: 15/02/2024
      DCB: 20/03/2024
      Beneficio: AUXILIO POR INCAPACIDADE TEMPORARIA
    `
  })
  assertCampo(cnis, "nb", "123.456.789-0")
  assertCampo(cnis, "der", "10/01/2024")
  assertCampo(cnis, "dib", "15/02/2024")
  assertCampo(cnis, "dcb", "20/03/2024")
  assertCampo(cnis, "beneficio", "AUXILIO POR INCAPACIDADE TEMPORARIA")

  const carta = extrairDadosDocumento({
    tipoDocumento: "Comunicacao de decisao",
    textoOCR: `
      Comunicacao de decisao
      NB: 222.333.444-5
      Tipo de decisao: INDEFERIDO
      Data da decisao: 04/04/2025
      Beneficio: APOSENTADORIA POR IDADE
    `
  })
  assertCampo(carta, "nb", "222.333.444-5")
  assertCampo(carta, "tipoDecisao", "INDEFERIDO")
  assertCampo(carta, "data", "04/04/2025")
  assertCampo(carta, "beneficio", "APOSENTADORIA POR IDADE")

  const laudo = extrairDadosDocumento({
    tipoDocumento: "Laudo",
    textoOCR: `
      Laudo medico
      Medico: DRA ANA CARDOSO
      CRM: SP 123456
      Especialidade: ORTOPEDIA
      CID: M54.5
      Data do laudo: 08/06/2026
    `
  })
  assertCampo(laudo, "medico", "DRA ANA CARDOSO")
  assertCampo(laudo, "crm", "SP 123456")
  assertCampo(laudo, "especialidade", "ORTOPEDIA")
  assertCampo(laudo, "cid", "M54.5")
  assertCampo(laudo, "dataLaudo", "08/06/2026")

  const processo = extrairDadosDocumento({
    tipoDocumento: "Sentenca",
    resultadoClassificador: { categoria: "processual" },
    textoOCR: `
      Processo: 0001234-56.2024.5.02.0001
      12a Vara do Trabalho de Sao Paulo
      Tribunal: TRT-2
    `
  })
  assertCampo(processo, "numero", "0001234-56.2024.5.02.0001")
  assertCampo(processo, "vara", "12a Vara do Trabalho de Sao Paulo")
  assertCampo(processo, "tribunal", "TRT-2")

  const cadastroSocial = extrairDadosDocumento({
    tipoDocumento: "Comprovante de atualizacao do Cadastro Unico CRAS",
    resultadoClassificador: { categoria: "cadastro_social", subtipo: "cadastro_unico_cras" },
    textoOCR: `
      Cadastro Unico
      Responsavel familiar: MARIA DA SILVA
      CPF: 123.456.789-09
      NIS: 123.45678.90-1
      Data da atualizacao: 15/08/2026
      Municipio: Recife
    `
  })
  assertCampo(cadastroSocial, "nome", "MARIA DA SILVA")
  assertCampo(cadastroSocial, "cpf", "123.456.789-09")
  assertCampo(cadastroSocial, "nis", "123.45678.90-1")
  assertCampo(cadastroSocial, "dataAtualizacao", "15/08/2026")
  assertCampo(cadastroSocial, "municipio", "Recife")

  const incompleto = extrairDadosDocumento({
    tipoDocumento: "RG frente",
    textoOCR: "Nome: APENAS NOME"
  })
  assertCampo(incompleto, "nome", "APENAS NOME")
  assert.ok(incompleto.camposNaoEncontrados.includes("cpf"))
  assert.ok(incompleto.avisos.some(aviso => aviso.code === "DOCUMENT_FIELDS_NOT_FOUND"))

  const semTexto = extrairDadosDocumento({
    tipoDocumento: "RG frente",
    textoOCR: ""
  })
  assert.equal(semTexto.erros[0].code, "DOCUMENT_TEXT_REQUIRED")

  const semExtrator = extrairDadosDocumento({
    tipoDocumento: "Documento desconhecido",
    textoOCR: "Algum texto"
  })
  assert.equal(semExtrator.avisos[0].code, "DOCUMENT_TYPE_UNSUPPORTED")
}

main()
console.log("document-extractor.test.js: ok")
