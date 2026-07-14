const fs = require('fs')
const path = require('path')

// DOMAIN SERVICE (storage-agnostic)
function normalizeArea(area) {
  if (!area) return null
  return String(area).trim()
}

function resolvePrefix(area) {
  const siglas = {
    INSS: 'PRV',
    Trabalhista: 'CLT',
    Família: 'FAM',
    Consumidor: 'CDC',
    Penal: 'PEN',
    Civil: 'CIV',
    'Imobiliário': 'IMO',
    Outros: 'OUT',
    Revisão: 'OUT',
    Revisao: 'OUT'
  }
  return siglas[area] || 'OUT'
}

function validateFormat(numero) {
  if (!numero || typeof numero !== 'string') return false
  return /^([A-Z]{2,4})\.\d{6}\.\d{3}$/.test(numero)
}

function formatExample() {
  return 'PREFIX.AAMMDD.NNN'
}

function generateCandidate(area, now = new Date()) {
  const b = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const p = (n, l = 2) => String(n).padStart(l, '0')
  const prefixo = resolvePrefix(normalizeArea(area))
  const num = `${String(b.getFullYear()).slice(2)}${p(b.getMonth() + 1)}${p(b.getDate())}`
  const rand = p(Math.floor(Math.random() * 1000), 3)
  return `${prefixo}.${num}.${rand}`
}

// Service factory: requires a repository implementing findByKey, findByNumber, reserve, release (optional)
function createService(repository) {
  if (!repository) throw new Error('repository adapter required')

  async function findByKey(key) {
    return repository.findByKey ? repository.findByKey(key) : null
  }

  async function findByNumber(numero) {
    return repository.findByNumber ? repository.findByNumber(numero) : null
  }

  async function reserve({ key, area }) {
    if (!key) throw new Error('key required')
    // Idempotent: return existing if present
    const existing = await findByKey(key)
    if (existing && existing.case_number) return { reserved: true, numero: existing.case_number, reused: true }

    // Try to reserve using repository atomically
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateCandidate(area)
      const conflict = await findByNumber(candidate)
      if (conflict) continue
      if (!repository.reserve) throw new Error('repository does not support reserve')
      const res = await repository.reserve({ key, numero: candidate, area })
      if (res && res.reserved) return { reserved: true, numero: candidate, reused: false }
      // if reservation failed due to conflict, loop
    }
    return { reserved: false, error: 'no_available_candidate' }
  }

  async function release({ key }) {
    if (!repository.release) return { released: false }
    return repository.release({ key })
  }

  return { generateCandidate, resolvePrefix, validateFormat, formatExample, findByKey, findByNumber, reserve, release }
}

// LOCAL TEST ADAPTER (file-backed). IMPORTANT: this is a test/fallback adapter only.
function defaultDataDir() {
  return process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data')
}

function localReservationsFile(dataDir) {
  return path.join(dataDir, 'case-number-reservations.json')
}

function localRead(dataDir) {
  const file = localReservationsFile(dataDir)
  if (!fs.existsSync(file)) return { reservations: {}, index: {} }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return { reservations: {}, index: {} } }
}

function localWrite(dataDir, payload) {
  fs.mkdirSync(dataDir, { recursive: true })
  const file = localReservationsFile(dataDir)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

function createLocalAdapter({ dataDir = null } = {}) {
  dataDir = dataDir || defaultDataDir()
  return {
    // Return reservation by key, or null
    findByKey: async (key) => {
      const state = localRead(dataDir)
      return state.reservations && state.reservations[key] ? { key, case_number: state.reservations[key].numero, createdAt: state.reservations[key].createdAt } : null
    },
    findByNumber: async (numero) => {
      const state = localRead(dataDir)
      const idx = state.index || {}
      const key = idx[numero]
      if (!key) return null
      const rec = state.reservations && state.reservations[key]
      return rec ? { key, case_number: rec.numero, createdAt: rec.createdAt } : null
    },
    reserve: async ({ key, numero, area }) => {
      const state = localRead(dataDir)
      state.reservations = state.reservations || {}
      state.index = state.index || {}
      if (state.index[numero]) return { reserved: false, reason: 'conflict' }
      state.reservations[key] = { numero, area, createdAt: new Date().toISOString() }
      state.index[numero] = key
      localWrite(dataDir, state)
      return { reserved: true }
    },
    release: async ({ key }) => {
      const state = localRead(dataDir)
      if (!state.reservations || !state.reservations[key]) return { released: false }
      const numero = state.reservations[key].numero
      delete state.index[numero]
      delete state.reservations[key]
      localWrite(dataDir, state)
      return { released: true }
    },
    // marker to indicate this is only a local adapter
    isTestAdapter: true
  }
}

// POSTGRES ADAPTER (prepared, does not connect by default)
function createPostgresAdapter({ pool }) {
  if (!pool) throw new Error('pg pool required')
  return {
    findByKey: async (key) => {
      const res = await pool.query('SELECT reservation_key, case_number, area, created_at FROM case_number_reservations WHERE reservation_key=$1', [key])
      return res.rowCount ? res.rows[0] : null
    },
    findByNumber: async (numero) => {
      const res = await pool.query('SELECT reservation_key, case_number, area, created_at FROM case_number_reservations WHERE case_number=$1', [numero])
      return res.rowCount ? res.rows[0] : null
    },
    reserve: async ({ key, numero, area }) => {
      try {
        const res = await pool.query(`INSERT INTO case_number_reservations(reservation_key, case_number, area, created_at, status) VALUES($1,$2,$3,CURRENT_TIMESTAMP,'reserved') ON CONFLICT (reservation_key) DO UPDATE SET case_number=EXCLUDED.case_number RETURNING reservation_key`, [key, numero, area])
        return { reserved: true }
      } catch (e) {
        // conflict on case_number or other unique constraint
        return { reserved: false, reason: e.message }
      }
    },
    release: async ({ key }) => {
      const res = await pool.query('DELETE FROM case_number_reservations WHERE reservation_key=$1', [key])
      return { released: res.rowCount > 0 }
    },
    isTestAdapter: false
  }
}

// Backwards-compatible default exports to minimize changes elsewhere
const localAdapter = createLocalAdapter()
const defaultService = createService(localAdapter)

module.exports = {
  // domain
  normalizeArea,
  resolvePrefix,
  validateFormat,
  formatExample,
  generateCandidate,
  // factory
  createService,
  // adapters
  createLocalAdapter,
  createPostgresAdapter,
  // default convenience (local, test/fallback only)
  defaultService
}
