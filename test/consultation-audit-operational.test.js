const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  LEGACY_CONSULTA_STAGE,
  STAGES_CONHECIDOS,
  auditar
} = require("../scripts/audit-consulta-phase1")

const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const eventoAtivo = {
  id: "evt-audit-active",
  status: "confirmed",
  start: { dateTime: futuro },
  end: { dateTime: futuro },
  extendedProperties: {
    private: {
      dealId: "deal-calendar",
      personId: "person-1",
      contactId: "contact-1"
    }
  }
}
const deals = [
  {
    id: "deal-calendar",
    properties: {
      dealstage: "presentationscheduled",
      estado_bot_snapshot: JSON.stringify({ consultaStatus: "agendada" })
    }
  },
  {
    id: "deal-legacy",
    properties: {
      dealstage: LEGACY_CONSULTA_STAGE,
      estado_bot_snapshot: "{}"
    }
  },
  {
    id: "deal-stale-snapshot",
    properties: {
      dealstage: "contractsent",
      estado_bot_snapshot: JSON.stringify({ consultaStatus: "agendada" })
    }
  }
]
const sessoes = [{
  negocioId: "deal-calendar",
  consultaStatus: "agendada"
}]

assert.equal(LEGACY_CONSULTA_STAGE, "1343040832")
assert.ok(STAGES_CONHECIDOS.includes(LEGACY_CONSULTA_STAGE))

const relatorio = auditar(deals, [eventoAtivo], sessoes)
assert.equal(relatorio.modo, "READ_ONLY")
assert.deepEqual(relatorio.escopo, {
  deals: 3,
  sessoesLocais: 1,
  eventosConsulta: 1,
  eventosAtivos: 1,
  snapshotsAtivos: 2,
  dealsNoStageLegado: 1,
  eventosPorStatus: { agendada: 1 },
  dealsPorStage: {
    presentationscheduled: 1,
    [LEGACY_CONSULTA_STAGE]: 1,
    contractsent: 1
  }
})
assert.equal(relatorio.totais.criticos, 1)
assert.equal(relatorio.totais.medios, 0)
assert.equal(relatorio.totais.aceitaveis, 1)
assert.equal(relatorio.achados.criticos[0].codigo, "SNAPSHOT_ATIVO_SEM_EVENTO")

const segundaExecucao = auditar([], [], [])
assert.deepEqual(segundaExecucao.totais, {
  criticos: 0,
  medios: 0,
  aceitaveis: 0
}, "metricas nao devem acumular achados de execucoes anteriores")

const fonte = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "audit-consulta-phase1.js"),
  "utf8"
)
assert.doesNotMatch(fonte, /\bSTAGE_CONSULTA\b/)
assert.doesNotMatch(fonte, /\bCONSULTA_STAGE\b/)

console.log("consultation-audit-operational: ok")
