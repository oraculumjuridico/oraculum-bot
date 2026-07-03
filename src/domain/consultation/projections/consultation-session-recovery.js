const fs = require("node:fs")
const path = require("node:path")
const {
  getConsultaStateAt
} = require("../consultation-replay-engine")
const {
  hashConsultationState
} = require("../integrity/consultation-integrity-hash")

const DEFAULT_SESSION_FILE = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "data",
  "users-state.json"
)

function sessionProjectionFromReplay(replayState = {}) {
  return {
    consultaStatus: replayState.status || "sem_consulta",
    tipoConsulta: replayState.currentEvent?.tipoConsulta || "inicial",
    _consultaInicio: replayState.currentEvent?.inicio || null,
    _consultaFim: replayState.currentEvent?.fim || null
  }
}

function selectConsultationSessions(state, consultationId) {
  return Object.entries(state?.users || {})
    .filter(([, session]) => String(session?.negocioId || "") === String(consultationId))
    .sort(([left], [right]) => left.localeCompare(right))
}

function projectionSnapshot(entries) {
  return entries.reduce((snapshot, [key, session]) => {
    snapshot[key] = {
      consultaStatus: session.consultaStatus || "sem_consulta",
      tipoConsulta: session.tipoConsulta || "inicial",
      _consultaInicio: session._consultaInicio || null,
      _consultaFim: session._consultaFim || null
    }
    return snapshot
  }, {})
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" })
  fs.renameSync(temporary, file)
}

async function refreshConsultationSessionProjection({
  consultationId,
  sessionFile = DEFAULT_SESSION_FILE,
  replay = getConsultaStateAt,
  clock = () => new Date().toISOString()
}) {
  if (!consultationId) throw new Error("consultationId obrigatorio para refresh da sessao")
  const startedAt = clock()
  const persisted = JSON.parse(fs.readFileSync(sessionFile, "utf8"))
  const sessions = selectConsultationSessions(persisted, consultationId)
  if (!sessions.length) {
    const error = new Error(`projecao de sessao nao encontrada: ${consultationId}`)
    error.code = "CONSULTATION_SESSION_PROJECTION_NOT_FOUND"
    throw error
  }

  const beforeHash = hashConsultationState(projectionSnapshot(sessions))
  const replayState = await replay(consultationId)
  const recovered = sessionProjectionFromReplay(replayState)
  for (const [, session] of sessions) Object.assign(session, recovered)
  const afterHash = hashConsultationState(projectionSnapshot(sessions))
  const refreshed = beforeHash !== afterHash

  if (refreshed) {
    atomicWriteJson(sessionFile, {
      ...persisted,
      savedAt: clock(),
      users: persisted.users
    })
  }
  const finishedAt = clock()
  return {
    refreshed,
    startedAt,
    finishedAt,
    beforeHash,
    afterHash
  }
}

module.exports = {
  DEFAULT_SESSION_FILE,
  sessionProjectionFromReplay,
  selectConsultationSessions,
  projectionSnapshot,
  atomicWriteJson,
  refreshConsultationSessionProjection
}
