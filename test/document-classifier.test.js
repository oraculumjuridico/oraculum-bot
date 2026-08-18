const assert = require("node:assert/strict")

const {
  CATEGORIAS_DOCUMENTAIS,
  TIPOS_DOCUMENTAIS,
  classificarDocumento
} = require("../src/domain/document-classifier")

function assertClassificacao(input, esperado) {
  const resultado = classificarDocumento(input)
  assert.equal(resultado.tipoDocumento, esperado.tipoDocumento)
  assert.equal(resultado.categoria, esperado.categoria)
  assert.equal(resultado.subtipo, esperado.subtipo)
  assert.ok(resultado.confianca >= esperado.confiancaMinima, `confianca baixa: ${resultado.confianca}`)
  assert.equal(Array.isArray(resultado.candidatos), true)
  assert.ok(resultado.candidatos.length >= 1)
  assert.equal(resultado.candidatos[0].tipoDocumento, esperado.tipoDocumento)
  assert.match(resultado.justificativa, /Sinais encontrados|Texto OCR ausente|Texto insuficiente/)
  return resultado
}

function main() {
  assert.ok(TIPOS_DOCUMENTAIS.length >= 24)

  assertClassificacao({
    textoOCR: "Republica Federativa do Brasil Carteira de Identidade Registro Geral Nome Filiacao Naturalidade",
    metadadosImagem: { mimeType: "image/png", width: 1200, height: 800 },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "RG frente",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "identidade",
    confiancaMinima: 0.6
  })

  assertClassificacao({
    textoOCR: "Assinatura do titular Polegar direito Secretaria de Seguranca Publica Via de identidade",
    metadadosImagem: { mimeType: "image/jpeg" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "RG verso",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "identidade",
    confiancaMinima: 0.55
  })

  assertClassificacao({
    textoOCR: "Cadastro de Pessoas Fisicas Comprovante de inscricao no CPF Receita Federal Situacao cadastral regular",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "CPF",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "cadastro_pessoa_fisica",
    confiancaMinima: 0.7
  })

  assertClassificacao({
    textoOCR: "Carteira Nacional de Habilitacao CNH DETRAN Categoria B Validade RENACH",
    metadadosImagem: { mimeType: "image/jpeg" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "CNH",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "habilitacao",
    confiancaMinima: 0.7
  })

  assertClassificacao({
    textoOCR: "Certidao de nascimento Registro Civil nascido nesta cidade genitores livro folha termo",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "Certidao de nascimento",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "registro_civil",
    confiancaMinima: 0.65
  })

  assertClassificacao({
    textoOCR: "Conta de energia comprovante de residencia endereco CEP titular unidade consumidora vencimento",
    metadadosImagem: { mimeType: "image/jpeg" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "Comprovante de residencia",
    categoria: CATEGORIAS_DOCUMENTAIS.PESSOAL,
    subtipo: "endereco",
    confiancaMinima: 0.65
  })

  assertClassificacao({
    textoOCR: "Holerite contracheque competencia salario base proventos descontos liquido a receber",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "Holerite",
    categoria: CATEGORIAS_DOCUMENTAIS.TRABALHISTA,
    subtipo: "remuneracao",
    confiancaMinima: 0.75
  })

  assertClassificacao({
    textoOCR: "Termo de Rescisao do Contrato de Trabalho TRCT verbas rescisorias data do afastamento aviso previo",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 2
  }, {
    tipoDocumento: "TRCT",
    categoria: CATEGORIAS_DOCUMENTAIS.TRABALHISTA,
    subtipo: "rescisao",
    confiancaMinima: 0.75
  })

  assertClassificacao({
    textoOCR: "Cadastro Nacional de Informacoes Sociais CNIS Meu INSS vinculos remuneracoes contribuicoes competencia",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 3
  }, {
    tipoDocumento: "CNIS",
    categoria: CATEGORIAS_DOCUMENTAIS.PREVIDENCIARIO,
    subtipo: "extrato_contribuicoes",
    confiancaMinima: 0.75
  })

  assertClassificacao({
    textoOCR: "Comunicacao de decisao Instituto Nacional do Seguro Social INSS requerimento beneficio data da decisao",
    metadadosImagem: { mimeType: "image/jpeg" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "Comunicacao de decisao",
    categoria: CATEGORIAS_DOCUMENTAIS.PREVIDENCIARIO,
    subtipo: "decisao_administrativa",
    confiancaMinima: 0.7
  })

  assertClassificacao({
    textoOCR: "Atestado medico atesto para os devidos fins afastamento por 10 dias CID CRM paciente repouso",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "Atestado",
    categoria: CATEGORIAS_DOCUMENTAIS.MEDICO,
    subtipo: "afastamento",
    confiancaMinima: 0.75
  })

  assertClassificacao({
    textoOCR: "Receita medica prescricao medicamento uso oral tomar uma vez ao dia CRM paciente",
    metadadosImagem: { mimeType: "image/jpeg" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "Receita",
    categoria: CATEGORIAS_DOCUMENTAIS.MEDICO,
    subtipo: "prescricao",
    confiancaMinima: 0.7
  })

  assertClassificacao({
    textoOCR: "Cadastro Unico CadUnico folha resumo Centro de Referencia de Assistencia Social CRAS NIS responsavel familiar data da atualizacao",
    metadadosImagem: { mimeType: "image/jpeg" },
    quantidadePaginas: 1
  }, {
    tipoDocumento: "Comprovante de atualizacao do Cadastro Unico CRAS",
    categoria: CATEGORIAS_DOCUMENTAIS.SOCIAL,
    subtipo: "cadastro_unico_cras",
    confiancaMinima: 0.75
  })

  const processual = assertClassificacao({
    textoOCR: "Excelentissimo Senhor Doutor Juiz peticao inicial processo advogado OAB requer a citacao",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 4
  }, {
    tipoDocumento: "Peticao",
    categoria: CATEGORIAS_DOCUMENTAIS.PROCESSUAL,
    subtipo: "peca_processual",
    confiancaMinima: 0.75
  })
  assert.ok(processual.candidatos.some(candidato => candidato.tipoDocumento === "Decisao"))

  assertClassificacao({
    textoOCR: "Sentenca relatorio fundamentacao dispositivo julgo procedente condeno ao pagamento das custas",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 5
  }, {
    tipoDocumento: "Sentenca",
    categoria: CATEGORIAS_DOCUMENTAIS.PROCESSUAL,
    subtipo: "ato_judicial",
    confiancaMinima: 0.75
  })

  const desconhecido = classificarDocumento({
    textoOCR: "foto ilegivel sem conteudo documental reconhecivel",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 1
  })
  assert.equal(desconhecido.tipoDocumento, "Documento desconhecido")
  assert.equal(desconhecido.categoria, CATEGORIAS_DOCUMENTAIS.OUTROS)
  assert.equal(desconhecido.subtipo, null)
  assert.equal(desconhecido.candidatos[0].tipoDocumento, "Documento desconhecido")

  const vazio = classificarDocumento({
    textoOCR: "",
    metadadosImagem: { mimeType: "image/png" },
    quantidadePaginas: 1
  })
  assert.equal(vazio.tipoDocumento, "Documento desconhecido")
  assert.equal(vazio.justificativa, "Texto OCR ausente ou vazio.")
}

main()
console.log("document-classifier.test.js: ok")
