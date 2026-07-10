const assert = require("assert")

const {
  DOCUMENTOS_POR_AREA,
  PERGUNTAS_POR_AREA,
  analisarCasoJuridico
} = require("../src/domain/legal-copilot")

function assertEstruturaExata(resultado) {
  assert.deepEqual(Object.keys(resultado), [
    "documentosRecomendados",
    "documentosPendentes",
    "perguntasSugeridas",
    "riscosIdentificados",
    "urgencia"
  ])
  assert.ok(Array.isArray(resultado.documentosRecomendados))
  assert.ok(Array.isArray(resultado.documentosPendentes))
  assert.ok(Array.isArray(resultado.perguntasSugeridas))
  assert.ok(Array.isArray(resultado.riscosIdentificados))
  assert.deepEqual(Object.keys(resultado.urgencia), ["nivel", "justificativas"])
  assert.ok(["Baixa", "M\u00e9dia", "Alta"].includes(resultado.urgencia.nivel))
  assert.ok(Array.isArray(resultado.urgencia.justificativas))
}

const casosPorArea = [
  {
    area: "INSS",
    documento: "CNIS",
    pergunta: "Houve pericia?",
    resumo: "Cliente sem beneficio, beneficio cortado e tutela urgente."
  },
  {
    area: "Trabalhista",
    documento: "CTPS",
    pergunta: "Recebia horas extras?",
    resumo: "Demissao sem pagamento, audiencia marcada e nao informou testemunhas."
  },
  {
    area: "Fam\u00edlia",
    documento: "Certidao de casamento",
    pergunta: "Existem filhos?",
    resumo: "Alimentos atrasados com risco alimentar."
  },
  {
    area: "Consumidor",
    documento: "Nota fiscal",
    pergunta: "Possui protocolo?",
    resumo: "Produto com defeito e protocolo informado."
  },
  {
    area: "Penal",
    documento: "Boletim de ocorrencia",
    pergunta: "Existe audiencia marcada?",
    resumo: "Cliente recebeu intimacao hoje e nao informou procuracao."
  },
  {
    area: "Civil",
    documento: "Contratos",
    pergunta: "Existe contrato escrito?",
    resumo: "Contrato com prazo proximo e mensagens entre as partes."
  },
  {
    area: "Imobili\u00e1rio",
    documento: "Matricula",
    pergunta: "O imovel possui matricula atualizada?",
    resumo: "Despejo com prazo para desocupacao."
  }
]

for (const caso of casosPorArea) {
  const resultado = analisarCasoJuridico({
    areaJuridica: caso.area,
    tipoCaso: "Consulta inicial",
    resumo: caso.resumo,
    dadosColetados: {
      nomeCompleto: "Cliente Teste",
      telefone: "5581999990000"
    },
    camposObrigatorios: ["nomeCompleto", "telefone"],
    documentosJaInformados: []
  })

  assertEstruturaExata(resultado)
  assert.ok(resultado.documentosRecomendados.includes(caso.documento), `documento ausente para ${caso.area}`)
  assert.ok(resultado.documentosPendentes.includes(caso.documento), `pendente ausente para ${caso.area}`)
  assert.ok(resultado.perguntasSugeridas.includes(caso.pergunta), `pergunta ausente para ${caso.area}`)
  assert.ok(resultado.riscosIdentificados.every(risco => /^Poss\u00edvel\b/.test(risco)), `risco sem linguagem cautelosa em ${caso.area}`)
}

const casoUrgente = analisarCasoJuridico({
  areaJuridica: "INSS",
  resumo: "Cliente esta sem beneficio, sem renda e pediu tutela urgente.",
  dadosColetados: { nomeCompleto: "Joao", telefone: "5581999990000" },
  camposObrigatorios: ["nomeCompleto", "telefone"],
  documentosJaInformados: ["RG", "CPF"]
})
assert.equal(casoUrgente.urgencia.nivel, "Alta")
assert.ok(casoUrgente.urgencia.justificativas.length > 0)

const casoMedio = analisarCasoJuridico({
  areaJuridica: "Consumidor",
  resumo: "Consulta inicial com documentacao incompleta.",
  dadosColetados: { nomeCompleto: "Ana", telefone: "" },
  camposObrigatorios: ["nomeCompleto", "telefone"],
  documentosJaInformados: ["Contrato"]
})
assert.equal(casoMedio.urgencia.nivel, "M\u00e9dia")
assert.ok(casoMedio.riscosIdentificados.some(risco => /campos obrigatorios/.test(risco)))

const casoVazio = analisarCasoJuridico()
assertEstruturaExata(casoVazio)
assert.ok(casoVazio.documentosRecomendados.includes("Documentos pessoais"))
assert.ok(casoVazio.documentosPendentes.includes("Documentos pessoais"))
assert.ok(casoVazio.perguntasSugeridas.includes("Existe algum prazo informado?"))
assert.equal(casoVazio.urgencia.nivel, "M\u00e9dia")

const docsTrabalhistas = DOCUMENTOS_POR_AREA.Trabalhista
const casoCompleto = analisarCasoJuridico({
  areaJuridica: "Trabalhista",
  tipoCaso: "Verbas rescisorias",
  resumo: "Consulta inicial sem prazo imediato. Possui testemunhas.",
  dadosColetados: {
    nomeCompleto: "Maria Silva",
    telefone: "5581999990000",
    cpf: "123.456.789-00",
    empresa: "Acme Ltda",
    motivo: "Verbas rescisorias"
  },
  camposObrigatorios: ["nomeCompleto", "telefone", "cpf", "empresa", "motivo"],
  documentosJaInformados: docsTrabalhistas
})
assertEstruturaExata(casoCompleto)
assert.deepEqual(casoCompleto.documentosPendentes, [])
assert.deepEqual(casoCompleto.riscosIdentificados, [])
assert.equal(casoCompleto.urgencia.nivel, "Baixa")

assert.ok(PERGUNTAS_POR_AREA.INSS.includes("Possui laudos recentes?"))

console.log("legal-copilot.test.js ok")
