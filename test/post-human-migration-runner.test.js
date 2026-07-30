"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")

const applyPath = require.resolve("../scripts/apply-post-human-migration.js")
const validatePath = require.resolve("../scripts/validate-post-human-migration.js")

const STATUSES = [
  "pending", "analyzing", "ready_to_send", "sending", "message_sent",
  "awaiting_response", "human_review_required", "failed_transient",
  "failed_terminal", "completed", "cancelled"
]
const ACTIVE = STATUSES.slice(0, 8)
const DOCUMENT_STATES = [
  "SEM_DOCUMENTOS", "DOCUMENTOS_PARCIAIS", "DOCUMENTOS_COMPLETOS",
  "DOCUMENTOS_NAO_ANALISADOS", "INFORMACOES_COMPLEMENTARES_PENDENTES",
  "REVISAO_HUMANA_NECESSARIA"
]
const SEND_RESULTS = ["pendente", "aceito_pelo_provider", "entregue", "falha", "incerto"]
const CONSTRAINT_COLUMNS = {
  post_human_cycles_pkey: ["cycle_id"],
  post_human_cycles_negocio_id_sequencia_key: ["negocio_id", "sequencia"],
  post_human_cycles_negocio_id_check: ["negocio_id"],
  post_human_cycles_numero_caso_check: ["numero_caso"],
  post_human_cycles_contato_id_check: ["contato_id"],
  post_human_cycles_sequencia_check: ["sequencia"],
  post_human_cycles_status_check: ["status"],
  post_human_cycles_estado_documental_check: ["estado_documental"],
  post_human_cycles_provider_message_id_check: ["provider_message_id"],
  post_human_cycles_resultado_envio_check: ["resultado_envio"],
  post_human_cycles_erro_check: ["erro"],
  post_human_cycles_version_check: ["version"]
}

const COLUMN_SPECS = [
  ["cycle_id", "uuid", false, null],
  ["negocio_id", "text", false, null],
  ["numero_caso", "text", false, null],
  ["contato_id", "text", true, null],
  ["sequencia", "integer", false, null],
  ["status", "text", false, null],
  ["estado_documental", "text", true, null],
  ["send_attempt_id", "uuid", true, null],
  ["provider_message_id", "text", true, null],
  ["resultado_envio", "text", true, null],
  ["erro", "text", true, null],
  ["payload", "jsonb", false, "'{}'::jsonb"],
  ["version", "integer", false, "0"],
  ["created_at", "timestamp with time zone", false, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp with time zone", false, "CURRENT_TIMESTAMP"]
]

function sqlArray(values) {
  return values.map(value => `'${value}'::text`).join(", ")
}

function validColumns() {
  return COLUMN_SPECS.map(([column_name, data_type, nullable, column_default]) => ({
    column_name,
    data_type,
    is_nullable: nullable ? "YES" : "NO",
    column_default
  }))
}

function validConstraints() {
  return [
    { conname: "post_human_cycles_pkey", definition: "PRIMARY KEY (cycle_id)" },
    { conname: "post_human_cycles_negocio_id_sequencia_key", definition: "UNIQUE (negocio_id, sequencia)" },
    { conname: "post_human_cycles_negocio_id_check", definition: "CHECK (length(negocio_id) BETWEEN 1 AND 128)" },
    { conname: "post_human_cycles_numero_caso_check", definition: "CHECK (length(numero_caso) BETWEEN 3 AND 80)" },
    { conname: "post_human_cycles_contato_id_check", definition: "CHECK (contato_id IS NULL OR length(contato_id) BETWEEN 1 AND 128)" },
    { conname: "post_human_cycles_sequencia_check", definition: "CHECK (sequencia > 0)" },
    { conname: "post_human_cycles_status_check", definition: `CHECK (status = ANY (ARRAY[${sqlArray(STATUSES)}]))` },
    { conname: "post_human_cycles_estado_documental_check", definition: `CHECK (((estado_documental IS NULL) OR (estado_documental = ANY (ARRAY[${sqlArray(DOCUMENT_STATES)}]))))` },
    { conname: "post_human_cycles_provider_message_id_check", definition: "CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 256)" },
    { conname: "post_human_cycles_resultado_envio_check", definition: `CHECK (((resultado_envio IS NULL) OR (resultado_envio = ANY (ARRAY[${sqlArray(SEND_RESULTS)}]))))` },
    { conname: "post_human_cycles_erro_check", definition: "CHECK (erro IS NULL OR length(erro) <= 1000)" },
    { conname: "post_human_cycles_version_check", definition: "CHECK (version >= 0)" }
  ].map((row, index) => ({
    ...row,
    contype: row.conname === "post_human_cycles_pkey" ? "p" : row.conname.endsWith("_key") ? "u" : "c",
    conkey: CONSTRAINT_COLUMNS[row.conname].map((_, columnIndex) => index * 10 + columnIndex + 1),
    convalidated: true,
    conenforced: true,
    columns: CONSTRAINT_COLUMNS[row.conname]
  }))
}

function validIndexes() {
  return [
    {
      indexname: "post_human_one_active_cycle_per_business",
      indexdef: `CREATE UNIQUE INDEX post_human_one_active_cycle_per_business ON public.post_human_cycles USING btree (negocio_id) WHERE (status = ANY (ARRAY[${sqlArray(ACTIVE)}]))`,
      indisunique: true,
      access_method: "btree",
      indisvalid: true,
      indisready: true,
      indislive: true,
      columns: ["negocio_id"],
      ordering: ["ASC"],
      predicate: `status = ANY (ARRAY[${sqlArray(ACTIVE)}])`
    },
    {
      indexname: "post_human_cycles_contact_active",
      indexdef: "CREATE INDEX post_human_cycles_contact_active ON public.post_human_cycles USING btree (contato_id, updated_at DESC) WHERE (contato_id IS NOT NULL)",
      indisunique: false,
      access_method: "btree",
      indisvalid: true,
      indisready: true,
      indislive: true,
      columns: ["contato_id", "updated_at"],
      ordering: ["ASC", "DESC"],
      predicate: "(contato_id IS NOT NULL)"
    },
    {
      indexname: "post_human_cycles_recovery",
      indexdef: "CREATE INDEX post_human_cycles_recovery ON public.post_human_cycles USING btree (status, updated_at)",
      indisunique: false,
      access_method: "btree",
      indisvalid: true,
      indisready: true,
      indislive: true,
      columns: ["status", "updated_at"],
      ordering: ["ASC", "ASC"],
      predicate: null
    }
  ]
}

function replaceConstraint(constraints, name, definition) {
  return constraints.map(row => row.conname === name ? { ...row, definition } : row)
}

function createMockPool(options = {}) {
  const {
    tableExists = true,
    functionExists = true,
    columns = validColumns(),
    constraints = validConstraints(),
    indexes = validIndexes(),
    queryFails = false,
    commitFails = false,
    connectFails = false,
    releaseFails = false
  } = options
  const queries = []
  let poolEnds = 0
  let releases = 0
  const client = {
    async query(sqlValue) {
      const sql = String(sqlValue)
      queries.push(sql)
      if (sql === "BEGIN" || sql === "BEGIN TRANSACTION READ ONLY" || sql === "ROLLBACK") return { rows: [] }
      if (queryFails) throw new Error("simulated query failure")
      if (sql === "COMMIT") {
        if (commitFails) throw new Error("commit failed")
        return { rows: [] }
      }
      if (sql.includes("CREATE TABLE IF NOT EXISTS post_human_cycles")) return { rows: [] }
      if (sql.includes("to_regprocedure")) return { rows: functionExists ? [{ func_name: "public.create_post_human_cycle(uuid,text,text,text)" }] : [] }
      if (sql.includes("information_schema.columns")) return { rows: columns }
      if (sql.includes("pg_catalog.pg_constraint")) return { rows: constraints }
      if (sql.includes("pg_catalog.pg_index")) return { rows: indexes }
      if (sql.includes("to_regclass")) return { rows: [{ table_name: tableExists ? "post_human_cycles" : null }] }
      return { rows: [] }
    },
    release() {
      releases += 1
      if (releaseFails) throw new Error("release failed")
    }
  }
  const pool = {
    async connect() {
      if (connectFails) throw new Error("connect failed")
      return client
    },
    async end() { poolEnds += 1 }
  }
  return {
    pool,
    queries,
    get poolEnds() { return poolEnds },
    get releases() { return releases }
  }
}

async function validateWith(options = {}) {
  const mock = createMockPool(options)
  const { validatePostHumanMigration } = require(validatePath)
  return { mock, promise: validatePostHumanMigration({ pool: mock.pool }) }
}

test("módulos podem ser importados sem executar main", () => {
  assert.equal(typeof require(applyPath).applyPostHumanMigration, "function")
  assert.equal(typeof require(validatePath).validatePostHumanMigration, "function")
})

test("apply exige URL sem pool, inclusive com poolFactory", async () => {
  let called = false
  const { applyPostHumanMigration } = require(applyPath)
  await assert.rejects(applyPostHumanMigration({ env: {}, poolFactory: () => { called = true } }), /URL ausente/)
  assert.equal(called, false)
})

test("validate exige URL sem pool, inclusive com poolFactory", async () => {
  let called = false
  const { validatePostHumanMigration } = require(validatePath)
  await assert.rejects(validatePostHumanMigration({ env: {}, poolFactory: () => { called = true } }), /URL ausente/)
  assert.equal(called, false)
})

test("apply lê e executa a migration uma vez", async () => {
  const mock = createMockPool()
  await require(applyPath).applyPostHumanMigration({ pool: mock.pool })
  assert.equal(mock.queries.filter(query => query.includes("CREATE TABLE IF NOT EXISTS post_human_cycles")).length, 1)
})

test("apply faz rollback após falha", async () => {
  const mock = createMockPool({ queryFails: true })
  await assert.rejects(require(applyPath).applyPostHumanMigration({ pool: mock.pool }))
  assert.ok(mock.queries.includes("ROLLBACK"))
  assert.equal(mock.releases, 1)
})

test("apply faz rollback quando COMMIT falha", async () => {
  const mock = createMockPool({ commitFails: true })
  await assert.rejects(require(applyPath).applyPostHumanMigration({ pool: mock.pool }), /commit failed/)
  assert.ok(mock.queries.includes("ROLLBACK"))
  assert.equal(mock.releases, 1)
})

test("apply encerra pool próprio quando connect falha", async () => {
  const mock = createMockPool({ connectFails: true })
  await assert.rejects(require(applyPath).applyPostHumanMigration({
    env: { EXTERNAL_STATE_DATABASE_URL: "postgresql://local" },
    poolFactory: () => mock.pool
  }))
  assert.equal(mock.poolEnds, 1)
})

test("apply encerra pool próprio quando readFileSync falha", async () => {
  const originalReadFileSync = fs.readFileSync
  const mock = createMockPool()
  fs.readFileSync = () => { throw new Error("read failed") }
  try {
    await assert.rejects(require(applyPath).applyPostHumanMigration({
      env: { EXTERNAL_STATE_DATABASE_URL: "postgresql://local" },
      poolFactory: () => mock.pool
    }), /read failed/)
  } finally {
    fs.readFileSync = originalReadFileSync
  }
  assert.equal(mock.poolEnds, 1)
})

test("apply encerra pool próprio quando query falha", async () => {
  const mock = createMockPool({ queryFails: true })
  await assert.rejects(require(applyPath).applyPostHumanMigration({
    env: { EXTERNAL_STATE_DATABASE_URL: "postgresql://local" },
    poolFactory: () => mock.pool
  }))
  assert.equal(mock.poolEnds, 1)
})

test("apply não encerra pool injetado", async () => {
  const mock = createMockPool()
  await require(applyPath).applyPostHumanMigration({ pool: mock.pool })
  assert.equal(mock.poolEnds, 0)
})

test("apply libera client em sucesso e falha", async () => {
  const success = createMockPool()
  await require(applyPath).applyPostHumanMigration({ pool: success.pool })
  assert.equal(success.releases, 1)
  const failure = createMockPool({ queryFails: true })
  await assert.rejects(require(applyPath).applyPostHumanMigration({ pool: failure.pool }))
  assert.equal(failure.releases, 1)
})

test("validate aceita catálogo PostgreSQL 18 completo", async () => {
  const { promise } = await validateWith()
  assert.deepEqual(await promise, { ok: true })
})

test("validate encerra pool próprio mesmo quando release falha", async () => {
  const mock = createMockPool({ releaseFails: true })
  const result = await require(validatePath).validatePostHumanMigration({
    env: { EXTERNAL_STATE_DATABASE_URL: "postgres://local" },
    poolFactory: () => mock.pool
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(mock.releases, 1)
  assert.equal(mock.poolEnds, 1)
})

test("cycle_id nullable falha", async () => {
  const columns = validColumns().map(row => row.column_name === "cycle_id" ? { ...row, is_nullable: "YES" } : row)
  const { promise } = await validateWith({ columns })
  await assert.rejects(promise, /cycle_id: nulabilidade YES/)
})

test("primary key ausente falha", async () => {
  const constraints = validConstraints().filter(row => row.conname !== "post_human_cycles_pkey")
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /post_human_cycles_pkey não encontrada/)
})

test("primary key com coluna adicional falha", async () => {
  const constraints = validConstraints().map(row => row.conname === "post_human_cycles_pkey"
    ? { ...row, columns: ["cycle_id", "negocio_id"], conkey: [1, 2], definition: "PRIMARY KEY (cycle_id, negocio_id)" }
    : row)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /post_human_cycles_pkey: colunas não conferem/)
})

test("UNIQUE negocio_id sequencia ausente falha", async () => {
  const constraints = validConstraints().filter(row => row.conname !== "post_human_cycles_negocio_id_sequencia_key")
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /negocio_id_sequencia_key não encontrada/)
})

test("UNIQUE negocio_id sequencia com coluna adicional falha", async () => {
  const constraints = validConstraints().map(row => row.conname === "post_human_cycles_negocio_id_sequencia_key"
    ? { ...row, columns: ["negocio_id", "sequencia", "cycle_id"], conkey: [2, 5, 1], definition: "UNIQUE (negocio_id, sequencia, cycle_id)" }
    : row)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /negocio_id_sequencia_key: colunas não conferem/)
})

test("constraint obrigatória não validada falha", async () => {
  const constraints = validConstraints().map(row => row.conname === "post_human_cycles_status_check"
    ? { ...row, convalidated: false }
    : row)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /status_check: não validada/)
})

test("constraint obrigatória não enforced falha claramente", async () => {
  const constraints = validConstraints().map(row => row.conname === "post_human_cycles_status_check"
    ? { ...row, conenforced: false }
    : row)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /status_check: não enforced/)
})

test("constraint negocio_id divergente falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_negocio_id_check", "CHECK (length(negocio_id) BETWEEN 1 AND 129)")
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /negocio_id_check divergente/)
})

test("constraint numero_caso divergente falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_numero_caso_check", "CHECK (length(numero_caso) BETWEEN 2 AND 80)")
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /numero_caso_check divergente/)
})

test("constraint contato_id divergente falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_contato_id_check", "CHECK (length(contato_id) BETWEEN 1 AND 128)")
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /contato_id_check divergente/)
})

test("constraint sequencia divergente falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_sequencia_check", "CHECK (sequencia >= 0)")
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /sequencia_check divergente/)
})

test("constraint status aceita IN", async () => {
  const definition = `CHECK (status IN (${STATUSES.map(value => `'${value}'`).join(", ")}))`
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_status_check", definition)
  const { promise } = await validateWith({ constraints })
  assert.deepEqual(await promise, { ok: true })
})

test("constraint status com valor adicional falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_status_check", `CHECK (status = ANY (ARRAY[${sqlArray([...STATUSES, "extra"])}]))`)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /status: valores permitidos divergentes/)
})

test("constraint status omitindo valor falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_status_check", `CHECK (status = ANY (ARRAY[${sqlArray(STATUSES.slice(1))}]))`)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /status: valores permitidos divergentes/)
})

test("constraint status associada à coluna errada falha", async () => {
  const constraints = validConstraints().map(row => row.conname === "post_human_cycles_status_check"
    ? {
        ...row,
        columns: ["estado_documental"],
        conkey: [7],
        definition: `CHECK (estado_documental = ANY (ARRAY[${sqlArray(STATUSES)}]))`
      }
    : row)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /status_check: colunas não conferem/)
})

test("constraint status com OR TRUE falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_status_check", `CHECK (status = ANY (ARRAY[${sqlArray(STATUSES)}]) OR TRUE)`)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /status: valores permitidos divergentes/)
})

test("constraint sequencia com AND adicional falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_sequencia_check", "CHECK (sequencia > 0 AND sequencia < 1000)")
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /sequencia_check divergente/)
})

test("constraint estado_documental divergente falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_estado_documental_check", `CHECK (estado_documental = ANY (ARRAY[${sqlArray(DOCUMENT_STATES.slice(1))}]))`)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /estado_documental: valores permitidos divergentes/)
})

test("constraint resultado_envio divergente falha", async () => {
  const constraints = replaceConstraint(validConstraints(), "post_human_cycles_resultado_envio_check", `CHECK (resultado_envio = ANY (ARRAY[${sqlArray([...SEND_RESULTS, "extra"])}]))`)
  const { promise } = await validateWith({ constraints })
  await assert.rejects(promise, /resultado_envio: valores permitidos divergentes/)
})

for (const [name, badDefinition] of [
  ["post_human_cycles_provider_message_id_check", "CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 257)"],
  ["post_human_cycles_erro_check", "CHECK (erro IS NULL OR length(erro) <= 1001)"],
  ["post_human_cycles_version_check", "CHECK (version > -2)"]
]) {
  test(`${name} divergente falha`, async () => {
    const constraints = replaceConstraint(validConstraints(), name, badDefinition)
    const { promise } = await validateWith({ constraints })
    await assert.rejects(promise, /divergente/)
  })
}

test("índice contact_active confirma contato_id ASC e updated_at DESC", async () => {
  const { promise } = await validateWith()
  assert.deepEqual(await promise, { ok: true })
})

test("índice updated_at sem DESC falha", async () => {
  const indexes = validIndexes().map(row => row.indexname === "post_human_cycles_contact_active" ? { ...row, ordering: ["ASC", "ASC"] } : row)
  const { promise } = await validateWith({ indexes })
  await assert.rejects(promise, /contact_active: ordenação não confere/)
})

test("índice com colunas em ordem incorreta falha", async () => {
  const indexes = validIndexes().map(row => row.indexname === "post_human_cycles_contact_active" ? { ...row, columns: ["updated_at", "contato_id"] } : row)
  const { promise } = await validateWith({ indexes })
  await assert.rejects(promise, /contact_active: colunas não conferem/)
})

test("predicado ativo com estado adicional falha", async () => {
  const indexes = validIndexes().map(row => row.indexname === "post_human_one_active_cycle_per_business"
    ? { ...row, predicate: `status = ANY (ARRAY[${sqlArray([...ACTIVE, "completed"])}])` }
    : row)
  const { promise } = await validateWith({ indexes })
  await assert.rejects(promise, /predicado: valores permitidos divergentes/)
})

test("predicado ativo omitindo estado falha", async () => {
  const indexes = validIndexes().map(row => row.indexname === "post_human_one_active_cycle_per_business"
    ? { ...row, predicate: `status = ANY (ARRAY[${sqlArray(ACTIVE.slice(1))}])` }
    : row)
  const { promise } = await validateWith({ indexes })
  await assert.rejects(promise, /predicado: valores permitidos divergentes/)
})

test("índice ativo com condição adicional falha", async () => {
  const indexes = validIndexes().map(row => row.indexname === "post_human_one_active_cycle_per_business"
    ? { ...row, predicate: `status = ANY (ARRAY[${sqlArray(ACTIVE)}]) AND negocio_id IS NOT NULL` }
    : row)
  const { promise } = await validateWith({ indexes })
  await assert.rejects(promise, /predicado: valores permitidos divergentes/)
})

test("índice contact_active com condição adicional falha", async () => {
  const indexes = validIndexes().map(row => row.indexname === "post_human_cycles_contact_active"
    ? { ...row, predicate: "contato_id IS NOT NULL AND updated_at IS NOT NULL" }
    : row)
  const { promise } = await validateWith({ indexes })
  await assert.rejects(promise, /contact_active: predicado parcial não confere/)
})

for (const [field, value, message] of [
  ["indisvalid", false, /indisvalid deve ser true/],
  ["indisready", false, /indisready deve ser true/],
  ["access_method", "hash", /access method deve ser btree/]
]) {
  test(`índice com ${field} inválido falha`, async () => {
    const indexes = validIndexes().map((row, index) => index === 0 ? { ...row, [field]: value } : row)
    const { promise } = await validateWith({ indexes })
    await assert.rejects(promise, message)
  })
}

test("sanitização mascara postgres, postgresql e password case-insensitive", () => {
  for (const modulePath of [applyPath, validatePath]) {
    const { sanitizeMessage } = require(modulePath)
    const result = sanitizeMessage("postgres://user:secret@host/db postgresql://u:s2@host/db PASSWORD=Hidden")
    assert.equal(result.includes("secret"), false)
    assert.equal(result.includes("s2"), false)
    assert.equal(result.includes("Hidden"), false)
    assert.match(result, /postgres:\/\/\*\*\*@/)
    assert.match(result, /postgresql:\/\/\*\*\*@/)
    assert.match(result, /password=\*\*\*/)
  }
})

test("não imprime registros da tabela nem consulta dados", async () => {
  const captured = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args) => captured.push(args.join(" "))
  console.error = (...args) => captured.push(args.join(" "))
  const mock = createMockPool()
  try {
    assert.deepEqual(await require(validatePath).validatePostHumanMigration({ pool: mock.pool }), { ok: true })
  } finally {
    console.log = originalLog
    console.error = originalError
  }
  const fictitious = ["PAYLOAD_SECRETO", "cycle-ficticio", "negocio-ficticio"]
  assert.deepEqual(captured, [])
  assert.equal(fictitious.some(value => captured.join(" ").includes(value)), false)
  for (const query of mock.queries) {
    if (!/post_human_cycles/i.test(query)) continue
    assert.match(query, /pg_catalog|information_schema|to_regclass|to_regprocedure/i)
    assert.doesNotMatch(query, /\bFROM\s+(?:public\.)?post_human_cycles\b/i)
  }
})

test("validador usa pg_catalog para colunas, ordem e predicado de índices", async () => {
  const mock = createMockPool()
  await require(validatePath).validatePostHumanMigration({ pool: mock.pool })
  const query = mock.queries.find(value => value.includes("pg_catalog.pg_index"))
  assert.match(query, /pg_catalog\.pg_attribute/)
  assert.match(query, /pg_catalog\.pg_am/)
  assert.match(query, /indoption/)
  assert.match(query, /indisvalid/)
  assert.match(query, /indisready/)
  assert.match(query, /indislive/)
  assert.match(query, /pg_get_expr\(ix\.indpred/)
  assert.doesNotMatch(query, /pg_get_indexdef/)
})

test("validador consulta estrutura e validação das constraints", async () => {
  const mock = createMockPool()
  await require(validatePath).validatePostHumanMigration({ pool: mock.pool })
  const query = mock.queries.find(value => value.includes("pg_catalog.pg_constraint"))
  assert.match(query, /contype/)
  assert.match(query, /conkey/)
  assert.match(query, /convalidated/)
  assert.match(query, /conenforced/)
  assert.match(query, /WITH ORDINALITY/)
  assert.match(query, /attribute\.attname/)
})

test("validador usa assinatura exata de to_regprocedure", async () => {
  const mock = createMockPool()
  await require(validatePath).validatePostHumanMigration({ pool: mock.pool })
  assert.ok(mock.queries.some(query => query.includes("to_regprocedure('public.create_post_human_cycle(uuid,text,text,text)')")))
})

test("migration existente permanece disponível e não é reescrita pelo runner", () => {
  const sql = fs.readFileSync(require("node:path").join(__dirname, "..", "migrations", "20260728_post_human_cycles.sql"), "utf8")
  assert.match(sql, /updated_at DESC/)
})

const realDatabaseUrl = process.env.POST_HUMAN_TEST_DATABASE_URL
const realDatabaseConfirmed = process.env.POST_HUMAN_TEST_DATABASE_CONFIRM === "ORACULUM_POST_HUMAN_DISPOSABLE"
test("integração opcional valida catálogo real PostgreSQL 18", { skip: !realDatabaseUrl || !realDatabaseConfirmed }, async () => {
  const parsedUrl = new URL(realDatabaseUrl)
  const localHost = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsedUrl.hostname.toLowerCase())
  assert.ok(localHost, "POST_HUMAN_TEST_DATABASE_URL deve usar host local")
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""))
  assert.ok(databaseName.startsWith("oraculum_post_human_test_"), "banco deve usar o prefixo descartável obrigatório")

  const { Pool } = require("pg")
  const pool = new Pool({ connectionString: realDatabaseUrl, max: 1 })
  let client
  let preflightPassed = false
  let migrationApplied = false
  try {
    client = await pool.connect()
    const version = await client.query("SHOW server_version_num")
    assert.ok(Number(version.rows[0].server_version_num) >= 180000, "teste requer PostgreSQL 18+")

    const tableBefore = await client.query("SELECT to_regclass('public.post_human_cycles') AS object_name")
    const functionBefore = await client.query("SELECT to_regprocedure('public.create_post_human_cycle(uuid,text,text,text)') AS object_name")
    assert.equal(tableBefore.rows[0].object_name, null, "tabela já existe; limpeza recusada")
    assert.equal(functionBefore.rows[0].object_name, null, "função já existe; limpeza recusada")
    preflightPassed = true

    const migrationSql = fs.readFileSync(require("node:path").join(__dirname, "..", "migrations", "20260728_post_human_cycles.sql"), "utf8")
    await client.query(migrationSql)
    migrationApplied = true
    client.release()
    client = null

    const result = await require(validatePath).validatePostHumanMigration({ pool })
    assert.deepEqual(result, { ok: true })
  } finally {
    if (client) {
      try { client.release() } catch {}
    }
    try {
      if (preflightPassed && migrationApplied && realDatabaseConfirmed && localHost && databaseName.startsWith("oraculum_post_human_test_")) {
        await pool.query("DROP FUNCTION public.create_post_human_cycle(uuid,text,text,text)")
        await pool.query("DROP TABLE public.post_human_cycles")
      }
    } finally {
      await pool.end()
    }
  }
})
