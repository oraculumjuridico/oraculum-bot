const assert = require("node:assert/strict")
const {
  formatAnalysisNote,
  markerForCase,
  redactSensitiveData,
  syncAnalysisNote
} = require("../src/domain/hubspot-analysis-note")

function createFakeAdapter() {
  const notes = new Map()
  const deals = new Map()
  const contacts = new Map()
  const calls = []
  let sequence = 0
  const addAssociation = (map, objectId, noteId) => {
    if (!map.has(objectId)) map.set(objectId, new Set())
    map.get(objectId).add(noteId)
  }
  return {
    notes,
    deals,
    contacts,
    calls,
    adapter: {
      async findByDealAndMarker({ dealId, marker }) {
        calls.push(["find", dealId, marker])
        return [...(deals.get(dealId) || [])]
          .map(id => notes.get(id))
          .filter(note => note.body.includes(marker))
      },
      async create({ body, dealId, contactId }) {
        const id = `note-${++sequence}`
        const note = { id, body }
        notes.set(id, note)
        addAssociation(deals, dealId, id)
        if (contactId) addAssociation(contacts, contactId, id)
        calls.push(["create", id])
        return note
      },
      async update({ noteId, body }) {
        notes.get(noteId).body = body
        calls.push(["update", noteId])
      },
      async associateDeal({ noteId, dealId }) {
        addAssociation(deals, dealId, noteId)
        calls.push(["associateDeal", noteId, dealId])
      },
      async associateContact({ noteId, contactId }) {
        addAssociation(contacts, contactId, noteId)
        calls.push(["associateContact", noteId, contactId])
      }
    }
  }
}

async function main() {
  const formatted = formatAnalysisNote({
    caseNumber: "ORC.260814.001",
    clientName: "Maria Teste",
    summary: "Benefício foi indeferido e será analisado.",
    facts: ["Indeferimento informado pelo cliente"],
    preliminaryAnalysis: ["Conferir a fundamentação disponível"],
    documentsReceived: ["Carta de indeferimento", "CNIS"],
    documentsPending: ["Processo administrativo"],
    nextAction: "Solicitar o processo administrativo."
  })
  assert.match(formatted, /^<div><p><strong>ANÁLISE JURÍDICA ATUALIZADA<\/strong><br><strong>ORC\.260814\.001 — Maria Teste<\/strong><\/p><hr><\/div>/)
  const headings = [
    "📌 SITUAÇÃO ATUAL",
    "⚖️ PONTOS PARA ANÁLISE",
    "📂 DOCUMENTOS EXISTENTES",
    "⏳ PENDÊNCIAS",
    "➡️ PRÓXIMA AÇÃO"
  ]
  headings.reduce((lastIndex, heading) => {
    const index = formatted.indexOf(heading)
    assert.ok(index > lastIndex, `${heading} deve respeitar a ordem visual`)
    return index
  }, -1)
  assert.match(formatted, /<p><strong>📌 SITUAÇÃO ATUAL<\/strong><\/p><p>/)
  assert.match(formatted, /<ul><li>Carta de indeferimento<\/li><li>CNIS<\/li><\/ul>/)

  const minimal = formatAnalysisNote({ caseNumber: "ORC.002", caseType: "Previdenciário", summary: "Relato confirmado." })
  assert.doesNotMatch(minimal, /PONTOS PARA ANÁLISE|DOCUMENTOS EXISTENTES|PENDÊNCIAS|PRÓXIMA AÇÃO|OBSERVAÇÃO/)

  const review = formatAnalysisNote({
    caseNumber: "ORC.003",
    caseType: "Caso",
    summary: "Há divergência documental.",
    analysisStatus: "review_required",
    reviewReasons: ["Nome divergente entre documentos"]
  })
  assert.match(review, /⚠️ REVISÃO HUMANA NECESSÁRIA/)
  assert.match(review, /⚠️ OBSERVAÇÃO/)

  const sensitive = formatAnalysisNote({
    caseNumber: "ORC.004",
    clientName: "Cliente",
    summary: "CPF 529.982.247-25 telefone +55 (85) 99999-1234 senha: segredo token=abc123 Bearer xyz987 https://privado.example/caso",
    facts: ["JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"]
  })
  assert.doesNotMatch(sensitive, /529\.982|99999-1234|segredo|abc123|xyz987|eyJhbGci|privado\.example/)
  assert.match(sensitive, /\[CPF OMITIDO\]/)
  assert.match(sensitive, /\[TELEFONE OMITIDO\]/)
  assert.equal(redactSensitiveData("senha=minhaSenha"), "senha: [DADO SENSÍVEL OMITIDO]")
  assert.equal(redactSensitiveData("senha: minha senha secreta"), "senha: [DADO SENSÍVEL OMITIDO]")
  assert.equal(redactSensitiveData("Credenciais Gov.br: usuario teste senha aberta"), "Credenciais Gov.br: [DADO SENSÍVEL OMITIDO]")
  assert.equal(redactSensitiveData("NB 175043832-9"), "NB 175043832-9")
  assert.equal(redactSensitiveData("protocolo 1099179194"), "protocolo 1099179194")
  assert.equal(redactSensitiveData("telefone: 85999991234"), "telefone: [TELEFONE OMITIDO]")

  const limited = formatAnalysisNote({ caseNumber: "ORC.005", summary: "x".repeat(70000) })
  assert.ok(limited.length <= 65000)
  assert.match(limited, new RegExp(`${markerForCase("ORC.005").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/small><\\/p>$`))

  const fake = createFakeAdapter()
  const base = {
    dealId: "deal-a",
    contactId: "contact-a",
    contactUnambiguous: true,
    caseNumber: "ORC.100",
    clientName: "Mesmo Cliente",
    summary: "Resumo inicial",
    documentsReceived: ["RG"],
    documentsPending: ["CNIS"],
    nextAction: "Solicitar CNIS"
  }
  const first = await syncAnalysisNote(base, { adapter: fake.adapter })
  assert.deepEqual({ ok: first.ok, action: first.action }, { ok: true, action: "created" })
  assert.equal(fake.notes.size, 1)
  assert.deepEqual([...fake.deals.get("deal-a")], [first.noteId])
  assert.deepEqual([...fake.contacts.get("contact-a")], [first.noteId])

  const second = await syncAnalysisNote({
    ...base,
    documentsReceived: ["RG", "CNIS"],
    documentsPending: [],
    nextAction: "Revisar documentos recebidos"
  }, { adapter: fake.adapter })
  assert.equal(second.action, "updated")
  assert.equal(second.noteId, first.noteId)
  assert.equal(fake.notes.size, 1)
  assert.match(fake.notes.get(first.noteId).body, /<li>CNIS<\/li>/)
  assert.doesNotMatch(fake.notes.get(first.noteId).body, /⏳ PENDÊNCIAS/)
  assert.match(fake.notes.get(first.noteId).body, /Revisar documentos recebidos/)

  const otherCase = await syncAnalysisNote({
    ...base,
    dealId: "deal-b",
    caseNumber: "ORC.101",
    summary: "Outro caso do mesmo cliente",
    contactUnambiguous: false
  }, { adapter: fake.adapter })
  assert.equal(otherCase.action, "created")
  assert.notEqual(otherCase.noteId, first.noteId)
  assert.equal(fake.notes.size, 2)
  assert.deepEqual([...fake.deals.get("deal-b")], [otherCase.noteId])
  assert.equal(fake.contacts.get("contact-a").has(otherCase.noteId), false)
  assert.match(fake.notes.get(first.noteId).body, new RegExp(markerForCase("ORC.100").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(fake.notes.get(otherCase.noteId).body, new RegExp(markerForCase("ORC.101").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

  const logged = []
  const failed = await syncAnalysisNote(base, {
    adapter: { findByDealAndMarker: async () => { throw Object.assign(new Error("conteúdo privado"), { code: "RATE_LIMIT" }) } },
    logError: event => logged.push(event)
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.error, "RATE_LIMIT")
  assert.deepEqual(logged, [{ operation: "syncAnalysisNote", code: "RATE_LIMIT", dealId: "deal-a" }])
  assert.equal(JSON.stringify(logged).includes("conteúdo privado"), false)

  assert.equal(fake.calls.some(call => call[0] === "create"), true)
  assert.equal(fake.calls.some(call => call[0] === "update"), true)
  assert.equal(fake.calls.some(call => call[0] === "associateDeal"), false)
  console.log("hubspot-analysis-note.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
