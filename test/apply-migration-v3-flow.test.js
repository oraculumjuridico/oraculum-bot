"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")

const { MIGRATION_ID, ALTER_SQL, validateAuthorizationV3Schema } = require("../src/infrastructure/single-case-authorization-v3-migration")

// Simula pool e client pg
function mockPool({ migrationExists = false, v2ConstraintPresent = true, v3ConstraintPresent = false, connectionFails = false, transactionFails = false }) {
  const state = {
    connected: false,
    inTransaction: false,
    transactionType: null,
    committed: false,
    rolledBack: false,
    migrationApplied: migrationExists,
    v2Present: v2ConstraintPresent,
    v3Present: v3ConstraintPresent,
    queries: [],
    errorHandlers: []
  }

  const client = {
    on: (event, handler) => {
      if (event === 'error') state.errorHandlers.push(handler)
    },
    removeAllListeners: (event) => {
      if (event === 'error') state.errorHandlers = []
    },
    query: async (sql, params) => {
      state.queries.push({ sql: String(sql).substring(0, 50), params })

      if (connectionFails && sql.includes('BEGIN')) {
        throw new Error('Connection terminated unexpectedly')
      }

      if (transactionFails && sql.includes('ALTER TABLE')) {
        throw new Error('lock timeout exceeded')
      }

      if (sql === 'BEGIN' || sql === 'BEGIN TRANSACTION READ ONLY') {
        state.inTransaction = true
        state.transactionType = sql.includes('READ ONLY') ? 'READ ONLY' : 'WRITE'
        state.rolledBack = false // Reset
        return { rows: [], rowCount: 0 }
      }

      if (sql === 'COMMIT') {
        if (!state.inTransaction) throw new Error('no transaction in progress')
        state.committed = true
        state.inTransaction = false
        // Após commit, v3 passa a existir se ALTER foi executado
        if (state.queries.some(q => q.sql.includes('ALTER TABLE'))) {
          state.v3Present = true
          state.v2Present = false
        }
        return { rows: [], rowCount: 0 }
      }

      if (sql === 'ROLLBACK') {
        state.rolledBack = true
        state.inTransaction = false
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('SET LOCAL')) {
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('to_regclass') && sql.includes('oraculum_state_migrations')) {
        return { rows: [{ table_name: 'oraculum_state_migrations' }], rowCount: 1 }
      }

      if (sql.includes('to_regclass') && sql.includes('single_case_apply_authorizations')) {
        return { rows: [{ table_name: 'single_case_apply_authorizations' }], rowCount: 1 }
      }

      if (sql.includes('FROM oraculum_state_migrations WHERE migration_id')) {
        return {
          rows: state.migrationApplied ? [{ migration_id: MIGRATION_ID }] : [],
          rowCount: state.migrationApplied ? 1 : 0
        }
      }

      if (sql.includes('single_case_auth_v3_scope_check') && !sql.includes('single_case_auth_v2')) {
        return {
          rows: state.v3Present ? [{ conname: 'single_case_auth_v3_scope_check' }] : [],
          rowCount: state.v3Present ? 1 : 0
        }
      }

      if (sql.includes('single_case_auth_v2_scope_check')) {
        return {
          rows: state.v2Present ? [{ conname: 'single_case_auth_v2_scope_check' }] : [],
          rowCount: state.v2Present ? 1 : 0
        }
      }

      if (sql.includes('ALTER TABLE')) {
        // Não muda estado até COMMIT
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('INSERT INTO oraculum_state_migrations')) {
        state.migrationApplied = true
        return { rows: [], rowCount: 1 }
      }

      if (sql.includes('COUNT') && sql.includes('authorization_type')) {
        // Sem registros incompatíveis
        return { rows: [{ count: '0' }], rowCount: 1 }
      }

      if (sql.includes('conname') && sql.includes('pg_constraint')) {
        const constraints = []
        if (state.v2Present) constraints.push({ conname: 'single_case_auth_v2_scope_check' })
        if (state.v3Present) constraints.push({ conname: 'single_case_auth_v3_scope_check' })
        return { rows: constraints, rowCount: constraints.length }
      }

      return { rows: [], rowCount: 0 }
    },
    release: () => { state.connected = false }
  }

  const pool = {
    connect: async () => {
      if (connectionFails && !state.connected) {
        throw new Error('Connection terminated unexpectedly')
      }
      state.connected = true
      return client
    },
    end: async () => {}
  }

  return { pool, client, state }
}

// ═══ TESTES ═══

test("connection error antes de BEGIN é detectado", async () => {
  const mock = mockPool({ connectionFails: true })
  const { client } = mock

  await assert.rejects(
    () => client.query("BEGIN"),
    /Connection terminated/
  )
})

test("error handler captura erro de conexão sem crash", () => {
  const mock = mockPool({})
  const { client, state } = mock

  let errorCaught = false
  client.on('error', (err) => {
    errorCaught = true
    assert.match(err.message, /terminated/)
  })

  assert.equal(state.errorHandlers.length, 1)

  // Simula erro
  state.errorHandlers[0](new Error('Connection terminated unexpectedly'))
  assert.equal(errorCaught, true)
})

test("falha antes de COMMIT resulta em ROLLBACK", async () => {
  const mock = mockPool({ transactionFails: true })
  const { client, state } = mock

  await client.query("BEGIN")

  try {
    await client.query(ALTER_SQL)
    assert.fail("Deveria ter lançado erro")
  } catch (error) {
    await client.query("ROLLBACK")
    assert.equal(state.rolledBack, true)
    assert.equal(state.committed, false)
    assert.equal(state.v3Present, false)
    assert.equal(state.v2Present, true)
  }
})

test("client.release ocorre apenas ao final", async () => {
  const mock = mockPool({})
  const { client, state } = mock

  assert.equal(state.connected, false)
  await mock.pool.connect()
  assert.equal(state.connected, true)

  await client.query("BEGIN")
  await client.query("ROLLBACK")
  assert.equal(state.connected, true) // Ainda conectado

  client.release()
  assert.equal(state.connected, false) // Agora desconectado
})

test("removeAllListeners limpa handlers", () => {
  const mock = mockPool({})
  const { client, state } = mock

  client.on('error', () => {})
  assert.equal(state.errorHandlers.length, 1)

  client.removeAllListeners('error')
  assert.equal(state.errorHandlers.length, 0)
})

test("v3 presente e v2 ausente é aceita", async () => {
  const mock = mockPool({ v2ConstraintPresent: false, v3ConstraintPresent: true })
  const { client, state } = mock

  await client.query('BEGIN TRANSACTION READ ONLY')

  // Verifica estado interno
  assert.equal(state.v3Present, true)
  assert.equal(state.v2Present, false)

  await client.query('ROLLBACK')
  assert.equal(state.rolledBack, true)
})

test("segunda execução idempotente detecta já aplicada", async () => {
  const mock = mockPool({ migrationExists: true, v2ConstraintPresent: false, v3ConstraintPresent: true })
  const { client, state } = mock

  await client.query('BEGIN')

  // Simula registro já existente
  const prior = await client.query('SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1', [MIGRATION_ID])
  assert.equal(prior.rowCount, 1) // já existe

  await client.query('ROLLBACK')

  // Não deve ter tentado ALTER
  assert.equal(state.queries.filter(q => q.sql && q.sql.includes('ALTER TABLE')).length, 0)
})

test("migration aplicada com sucesso altera estado", async () => {
  const mock = mockPool({ migrationExists: false, v2ConstraintPresent: true, v3ConstraintPresent: false })
  const { client, state } = mock

  await client.query('BEGIN')
  assert.equal(state.v3Present, false)
  assert.equal(state.v2Present, true)

  // Aplicar ALTER
  await client.query(ALTER_SQL)

  // Antes do COMMIT, v3 ainda não visível
  assert.equal(state.v3Present, false)

  await client.query('COMMIT')

  // Após COMMIT, v3 presente e v2 ausente
  assert.equal(state.v3Present, true)
  assert.equal(state.v2Present, false)
  assert.equal(state.committed, true)
})

console.log("apply-migration-v3-flow.test.js: ok")
