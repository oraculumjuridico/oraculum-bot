const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const arquivoEventos = path.join(os.tmpdir(), `consulta-idempotency-${process.pid}.jsonl`)
process.env.CONSULTA_EVENTS_FILE = arquivoEventos
const { criarEventoConsulta } = require("../src/domain/calendar-scheduling")

async function main() {
  const armazenados = []
  const removidos = []
  let inserts = 0
  const calendar = {
    events: {
      list: async ({ showDeleted }) => ({
        data: {
          items: armazenados.filter(evento => showDeleted || evento.status !== "cancelled")
        }
      }),
      insert: async ({ requestBody }) => {
        inserts++
        const evento = { ...requestBody, status: "confirmed" }
        armazenados.push(evento)
        return { data: evento }
      },
      delete: async ({ eventId }) => {
        const evento = armazenados.find(item => item.id === eventId)
        if (evento) evento.status = "cancelled"
        removidos.push(eventId)
      },
      get: async ({ eventId }) => ({ data: armazenados.find(item => item.id === eventId) })
    }
  }
  const cliente = {
    negocioId: "deal-idempotente",
    contatoId: "contact-1",
    personId: "person-1",
    nome: "Cliente",
    numeroCaso: "CASO-1"
  }
  const horario1 = new Date("2027-08-12T14:00:00-03:00")
  const horario2 = new Date("2027-08-12T15:00:00-03:00")

  const primeiro = await criarEventoConsulta(cliente, horario1, 60, { calendar })
  const retry = await criarEventoConsulta(cliente, horario1, 60, { calendar })
  assert.equal(retry, primeiro)
  assert.equal(inserts, 1, "retry nao cria evento duplicado")

  const reagendado = await criarEventoConsulta(cliente, horario2, 60, { calendar })
  assert.notEqual(reagendado, primeiro)
  assert.equal(inserts, 2)
  assert.deepEqual(removidos, [primeiro], "reagendamento cancela o evento ativo anterior")
  assert.equal(
    armazenados.filter(evento => evento.status === "confirmed").length,
    1,
    "existe somente um evento ativo por deal"
  )

  console.log("consultation-idempotency: ok")
}

main().catch(e => {
  console.error(e)
  process.exitCode = 1
}).finally(() => {
  try { fs.unlinkSync(arquivoEventos) } catch {}
  try { fs.unlinkSync(`${arquivoEventos}.lock`) } catch {}
})
