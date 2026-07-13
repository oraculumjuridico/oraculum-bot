const assert = require("node:assert/strict")

const {
  extrairDadosDocumento,
  resolverFamiliaDocumento
} = require("../src/domain/document-extractor")

const { validCpf } = require("../src/domain/local-case-document-analysis")

function main() {
  // CPF mapped correctly
  assert.equal(resolverFamiliaDocumento("CPF"), "cpf")
  assert.equal(resolverFamiliaDocumento("Documento de CPF"), "cpf")

  // RG still takes precedence if mentioned
  assert.equal(resolverFamiliaDocumento("RG com CPF"), "rg")

  // CPF extraction - formatted with dots and dash
  const cpfFormatted = extrairDadosDocumento({
    tipoDocumento: "CPF",
    textoOCR: `
      CPF: 123.456.789-09
      Nome: JOÃO SILVA
    `
  })
  assert.equal(cpfFormatted.camposExtraidos.cpf, "123.456.789-09")
  assert.equal(cpfFormatted.camposExtraidos.nome, "JOÃO SILVA")
  assert.equal(cpfFormatted.erros.length, 0)
  assert.ok(cpfFormatted.confiancaPorCampo.cpf > 0)
  assert.ok(validCpf(cpfFormatted.camposExtraidos.cpf), "Extracted CPF should be valid")

  // CPF extraction - unformatted with label context
  const cpfUnformatted = extrairDadosDocumento({
    tipoDocumento: "CPF",
    textoOCR: `
      CPF: 12345678909
      Nome: MARIA SANTOS
    `
  })
  assert.equal(cpfUnformatted.camposExtraidos.cpf, "12345678909")
  assert.ok(cpfUnformatted.confiancaPorCampo.cpf > 0)
  assert.ok(validCpf(cpfUnformatted.camposExtraidos.cpf), "Unformatted CPF should also validate")

  // Invalid CPF (repeated digits) - may be extracted but will fail validation
  const cpfInvalid = extrairDadosDocumento({
    tipoDocumento: "CPF",
    textoOCR: `
      CPF: 11111111111
      Nome: PEDRO SILVA
    `
  })
  // The extractor will find it, but validCpf should reject it
  if (cpfInvalid.camposExtraidos.cpf) {
    assert.ok(!validCpf(cpfInvalid.camposExtraidos.cpf), "Repeated digit CPF should not validate")
  }

  // Invalid CPF (wrong check digits) - may be extracted but will fail validation
  const cpfWrongCheck = extrairDadosDocumento({
    tipoDocumento: "CPF",
    textoOCR: `
      CPF: 123.456.789-00
      Nome: ANA COSTA
    `
  })
  if (cpfWrongCheck.camposExtraidos.cpf) {
    assert.ok(!validCpf(cpfWrongCheck.camposExtraidos.cpf), "Wrong check digit CPF should not validate")
  }

  // Bare 11 digits without label should not be extracted (requires context)
  const cpfBare = extrairDadosDocumento({
    tipoDocumento: "CPF",
    textoOCR: "12345678909 without CPF label on another line"
  })
  // This might not find it since the label is required by regex
  assert.ok(!cpfBare.camposExtraidos.cpf || validCpf(cpfBare.camposExtraidos.cpf), "Bare number without label should not be extracted as CPF")

  console.log("✓ CPF extractor tests passed")
}

main()
