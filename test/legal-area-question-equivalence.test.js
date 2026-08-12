"use strict"

const assert = require("node:assert/strict")
const { pendingPostHumanLegalQuestions } = require("../src/domain/admin-assisted-intake-catalog")
const { CAMPOS_ADMIN_ASSISTIDO } = require("../src/domain/admin-assisted-ai-schema")

const minimum = {
  Trabalhista: 8,
  "Família": 7,
  Consumidor: 7,
  "Bancário": 8,
  Penal: 6,
  Civil: 7,
  "Imobiliário": 8,
  Outros: 5
}

for (const [area, expected] of Object.entries(minimum)) {
  const questions = pendingPostHumanLegalQuestions({ area, data: {} })
  assert.ok(questions.length >= expected, `${area} deve ter triagem jurídica material`)
  assert.equal(new Set(questions.map(item => item.id)).size, questions.length, `${area} não pode repetir pergunta`)
  for (const question of questions) {
    assert.ok(CAMPOS_ADMIN_ASSISTIDO[question.id], `${area}.${question.id} precisa de campo estruturado`)
    assert.ok(question.client, `${area}.${question.id} precisa de pergunta ao cliente`)
  }
}

console.log("legal-area-question-equivalence.test.js: ok")
