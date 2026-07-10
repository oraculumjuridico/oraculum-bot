const assert = require("assert")

delete process.env.GROQ_KEY

const { criarAnaliseFallback } = require("../src/domain/admin-assisted-ai-intelligence")

function main() {
  const inss = criarAnaliseFallback("Sai do meu trabalho e agora quero dar entrada no INSS.")
  assert.equal(inss.areaJuridica, "INSS")
  assert.equal(inss.dados.areaJuridica.valor, "INSS")

  const inssNegado = criarAnaliseFallback("O INSS negou meu beneficio, mas eu trabalhava registrado na empresa.")
  assert.equal(inssNegado.areaJuridica, "INSS")

  const trabalhista = criarAnaliseFallback("Fui demitida e a empresa nao pagou rescisao, FGTS nem ferias.")
  assert.equal(trabalhista.areaJuridica, "Trabalhista")

  const bancario = criarAnaliseFallback("O banco descontou emprestimo consignado indevido do meu beneficio.")
  assert.equal(bancario.areaJuridica, "Bancário")

  const baixaConfianca = criarAnaliseFallback("Preciso conversar com advogado sobre uma situacao.")
  assert.equal(baixaConfianca.areaJuridica, "Outros")
  assert.equal(baixaConfianca.tipoCaso, "Baixa confiança")

  const documentos = criarAnaliseFallback("Tenho carta do INSS, laudo medico e comprovante de residencia.")
  assert.match(documentos.dados.documentosMencionados.valor, /Carta de indeferimento/i)
  assert.match(documentos.dados.documentosMencionados.valor, /Documentos m.dicos/i)

  console.log("admin-assisted-ai-intelligence.test.js ok")
}

main()
