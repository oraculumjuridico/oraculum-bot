"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const {
  MIGRATION_ID, TABLE_NAME, ALGORITHM, ACTIVE_INDEX, CREATE_TABLE_SQL, EXPECTED_COLUMNS,
  createSingleCaseAuthorizationRepository, validateSingleCaseAuthorizationSchema, migrateSingleCaseAuthorizations
} = require("../src/infrastructure/single-case-authorization-postgres")
const { trustedPublicKeysFromEnv, createSingleCaseAuthorizationComponents } = require("../src/composition/single-case-authorization-components")
const { AUTH_SCOPES, AUTHORIZATION_SCHEMA_VERSION, authorizationPayload, authorizablePlanHash, createAuthorizationVerifier, validateAuthorizations } = require("../src/domain/single-case-apply-contracts")
const { createSingleCaseApplyExecutor } = require("../src/domain/single-case-apply")
const cli = require("../scripts/apply-single-case")

const NOW = "2026-07-15T12:00:00.000Z"
const TEST_CHECKS = Object.freeze({
  single_case_auth_schema_check:{expression:"CHECK ((schema_version = 1))",columns:["schema_version"]},
  single_case_auth_type_check:{expression:"CHECK ((authorization_type = ANY (ARRAY['EXPLICIT_APPLY_AUTHORIZATION'::text, 'EXTERNAL_WRITES_AUTHORIZATION'::text])))",columns:["authorization_type"]},
  single_case_auth_algorithm_check:{expression:"CHECK ((signature_algorithm = 'Ed25519'::text))",columns:["signature_algorithm"]},
  single_case_auth_id_check:{expression:"CHECK ((authorization_id ~ '^[A-Za-z0-9._:-]{8,128}$'::text))",columns:["authorization_id"]},
  single_case_auth_case_id_check:{expression:"CHECK ((case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'::text))",columns:["case_import_id"]},
  single_case_auth_fingerprint_check:{expression:"CHECK ((case_fingerprint ~ '^[a-f0-9]{12}$'::text))",columns:["case_fingerprint"]},
  single_case_auth_case_number_check:{expression:"CHECK ((case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$'::text))",columns:["case_number"]},
  single_case_auth_plan_hash_check:{expression:"CHECK ((authorizable_plan_hash ~ '^[a-f0-9]{64}$'::text))",columns:["authorizable_plan_hash"]},
  single_case_auth_scope_check:{expression:"CHECK (((jsonb_typeof(scope) = 'array'::text) AND (jsonb_array_length(scope) > 0)))",columns:["scope"]},
  single_case_auth_dates_check:{expression:"CHECK ((expires_at > issued_at))",columns:["expires_at","issued_at"]},
  single_case_auth_revocation_check:{expression:"CHECK ((((revoked = false) AND (revoked_at IS NULL) AND (revocation_reason IS NULL)) OR ((revoked = true) AND (revoked_at IS NOT NULL) AND (revocation_reason ~ '^[A-Z0-9_]{3,80}$'::text))))",columns:["revocation_reason","revoked","revoked_at"]},
  single_case_auth_operational_status_check:{expression:"CHECK ((((operational_status = 'ACTIVE'::text) AND (superseded_at IS NULL)) OR ((operational_status = 'HISTORICAL'::text) AND (superseded_at IS NOT NULL))))",columns:["operational_status","superseded_at"]},
  single_case_auth_issuer_check:{expression:"CHECK ((issuer ~ '^[A-Za-z0-9._:-]{3,80}$'::text))",columns:["issuer"]},
  single_case_auth_signature_check:{expression:"CHECK ((signature ~ '^[A-Za-z0-9+/]{86}==$'::text))",columns:["signature"]},
  single_case_auth_audit_check:{expression:"CHECK ((jsonb_typeof(audit_metadata) = 'object'::text))",columns:["audit_metadata"]}
})
const plan = () => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "single-case-apply-plan.json"), "utf8"))
const keys = crypto.generateKeyPairSync("ed25519")
const expected = value => ({ caseImportId: value.caseImportId, caseFingerprint: value.caseFingerprint, caseNumber: value.dealPlan.caseNumber, authorizablePlanHash: authorizablePlanHash(value), schemaVersion: AUTHORIZATION_SCHEMA_VERSION, requiredScopes: AUTH_SCOPES })

function signedRows(value = plan(), mutate = row => row) {
  const binding = expected(value)
  return Object.entries(AUTH_SCOPES).map(([type, scope], index) => {
    const record = { authorizationId: `fixture-persisted-auth-${index + 1}`, schemaVersion: 1, type, caseImportId: binding.caseImportId, caseFingerprint: binding.caseFingerprint, caseNumber: binding.caseNumber, authorizablePlanHash: binding.authorizablePlanHash, scope: [...scope], issuer: "fixture-authority", issuedAt: "2026-07-15T11:00:00.000Z", expiresAt: "2026-07-15T13:00:00.000Z", revoked: false }
    const changed = mutate(record, index)
    const proof = crypto.sign(null, Buffer.from(authorizationPayload(changed)), keys.privateKey).toString("base64")
    return { authorization_id: changed.authorizationId, schema_version: changed.schemaVersion, authorization_type: changed.type, case_import_id: changed.caseImportId, case_fingerprint: changed.caseFingerprint, case_number: changed.caseNumber, authorizable_plan_hash: changed.authorizablePlanHash, scope: [...changed.scope], issuer: changed.issuer, issued_at: changed.issuedAt, expires_at: changed.expiresAt, revoked: changed.revoked, revoked_at: changed.revoked ? NOW : null, revocation_reason: changed.revoked ? "FIXTURE_REVOCATION" : null, operational_status: "ACTIVE", superseded_at: null, signature: proof, signature_algorithm: ALGORITHM }
  })
}

function memoryPool(rows = []) {
  const state = { rows: structuredClone(rows), queries: [], writes: 0 }
  return { state, async query(sql, params) {
    const text = String(sql).replace(/\s+/g, " ").trim(); state.queries.push({ text, params: structuredClone(params) })
    if (!text.startsWith("SELECT")) { state.writes++; throw new Error("WRITE_FORBIDDEN") }
    const selected = state.rows.filter(row => row.case_import_id === params[0] && row.case_fingerprint === params[1] && row.case_number === params[2] && row.authorizable_plan_hash === params[3] && row.schema_version === params[4] && row.operational_status === "ACTIVE" && params[5].includes(row.authorization_type)).sort((a, b) => a.authorization_type.localeCompare(b.authorization_type) || a.authorization_id.localeCompare(b.authorization_id))
    return { rowCount: selected.length, rows: structuredClone(selected) }
  } }
}

const verifier = createAuthorizationVerifier({ trustedIssuers: { "fixture-authority": keys.publicKey } })
const load = async (rows, query = expected(plan())) => { const pool = memoryPool(rows); return { pool, records: await createSingleCaseAuthorizationRepository({ pool }).loadForCase(query) } }

test("zero autorizações", async () => assert.deepEqual((await load([])).records, []))
test("somente autorização de apply", async () => assert.equal((await load(signedRows().slice(0, 1))).records.length, 1))
test("somente autorização de escrita", async () => assert.equal((await load(signedRows().slice(1))).records.length, 1))
test("exatamente duas autorizações válidas", async () => { const records=(await load(signedRows())).records;assert.equal(validateAuthorizations(records,expected(plan()),verifier,NOW).length,2) })
test("autorização de outro caso nunca é retornada", async () => { const rows=signedRows();rows.push(...signedRows(plan(),r=>({...r,caseImportId:"fixture-case-other"})));const result=await load(rows);assert.equal(result.records.length,2);assert(result.pool.state.queries[0].text.includes("case_import_id=$1")) })
test("outro fingerprint não é retornado", async () => assert.equal((await load(signedRows(plan(),r=>({...r,caseFingerprint:"aaaaaaaaaaaa"})))).records.length,0))
test("outro número não é retornado", async () => assert.equal((await load(signedRows(plan(),r=>({...r,caseNumber:"PRV.260715.999"})))).records.length,0))
test("outro hash não é retornado", async () => assert.equal((await load(signedRows(plan(),r=>({...r,authorizablePlanHash:"a".repeat(64)})))).records.length,0))
test("expirada preserva estado e domínio rejeita", async () => { const records=(await load(signedRows(plan(),r=>({...r,expiresAt:"2026-07-15T11:30:00.000Z"})))).records;assert.throws(()=>validateAuthorizations(records,expected(plan()),verifier,NOW),/AUTH_EXPIRED/) })
test("revogada preserva estado e domínio rejeita", async () => { const records=(await load(signedRows(plan(),r=>({...r,revoked:true})))).records;assert.equal(records[0].revoked,true);assert.throws(()=>validateAuthorizations(records,expected(plan()),verifier,NOW),/AUTH_REVOKED/) })
test("schema desconhecido não é retornado", async () => assert.equal((await load(signedRows(plan(),r=>({...r,schemaVersion:99})))).records.length,0))
test("algoritmo desconhecido falha fechado", async () => { const rows=signedRows();rows[0].signature_algorithm="RSA";await assert.rejects(()=>load(rows),/AUTHORIZATION_ALGORITHM_INVALID/) })
test("assinatura malformada é rejeitada pelo mapper", async () => { const rows=signedRows();rows[0].signature="%%%";await assert.rejects(()=>load(rows),/AUTHORIZATION_SIGNATURE_INVALID/) })
test("autorização duplicada do mesmo tipo é ambígua", async () => { const rows=signedRows();rows.push({...rows[0],authorization_id:"fixture-persisted-auth-3"});await assert.rejects(()=>load(rows),/AUTHORIZATION_REPOSITORY_AMBIGUOUS/) })
test("IDs duplicados são ambíguos", async () => { const rows=signedRows();rows[1].authorization_id=rows[0].authorization_id;await assert.rejects(()=>load(rows),/AUTHORIZATION_REPOSITORY_AMBIGUOUS/) })
test("datas incoerentes são rejeitadas pelo domínio", async () => { const records=(await load(signedRows(plan(),r=>({...r,expiresAt:r.issuedAt})))).records;assert.throws(()=>validateAuthorizations(records,expected(plan()),verifier,NOW),/AUTH_DATE_INVALID/) })
test("consulta usa um único caseImportId e todos os vínculos", async () => { const result=await load(signedRows());assert.equal(result.pool.state.queries.length,1);assert.equal(result.pool.state.queries[0].params.length,6);assert.equal(result.pool.state.queries[0].params[0],plan().caseImportId) })
test("não existe fallback por número ou fingerprint", async () => { const rows=signedRows(plan(),r=>({...r,caseImportId:"fixture-case-other"}));assert.equal((await load(rows)).records.length,0) })
test("ordem dos resultados é determinística", async () => { const rows=signedRows().reverse(),records=(await load(rows)).records;assert.deepEqual(records.map(x=>x.type),["EXPLICIT_APPLY_AUTHORIZATION","EXTERNAL_WRITES_AUTHORIZATION"]) })
test("indisponibilidade do repositório é propagada sem segredo", async () => { const repository=createSingleCaseAuthorizationRepository({pool:{query:async()=>{throw new Error("REPOSITORY_UNAVAILABLE")}}});await assert.rejects(()=>repository.loadForCase(expected(plan())),/REPOSITORY_UNAVAILABLE/) })
test("linha incompleta falha fechado", async () => { const rows=signedRows();delete rows[0].signature;await assert.rejects(()=>load(rows),/AUTHORIZATION_ROW_INCOMPLETE/) })
test("leitura não muta registros", async () => { const rows=signedRows(),before=structuredClone(rows),result=await load(rows);assert.deepEqual(result.pool.state.rows,before);assert.equal(result.pool.state.writes,0);assert(Object.isFrozen(result.records[0])) })
test("modelo não contém chave privada nem segredo", () => { const sql=CREATE_TABLE_SQL.toLowerCase();assert(!sql.includes("private_key"));assert(!sql.includes("signing_secret"));assert(sql.includes("signature text")) })
test("testes usam somente pool isolado", async () => { const result=await load(signedRows());assert.equal(result.pool.state.writes,0);assert.equal(result.pool.state.rows.length,2) })

test("adaptador integra com executor até a fronteira de lease", async () => {
  const value=plan(),pool=memoryPool(signedRows(value)),repository=createSingleCaseAuthorizationRepository({pool}),executor=createSingleCaseApplyExecutor({authorizationVerifier:verifier})
  const stop=async()=>{throw new Error("STOP_AFTER_PERSISTED_AUTHORIZATION")}, noop=async()=>[], verify=async()=>null
  const adapters={plans:{loadByCaseImportId:async()=>value},authorizations:repository,coordination:{acquireLease:stop,renewLease:stop,loadCheckpoint:verify,compareAndSetCheckpoint:stop,releaseLease:stop},reservation:{verify},contacts:{findContactsByCpf:noop,findContactsByPhone:noop,create:stop,verify},deals:{findByCaseNumber:noop,create:stop,verify},associations:{find:noop,create:stop,verify},drive:{findAreaFolders:noop,createAreaFolder:stop,findCaseFolders:noop,createCaseFolder:stop,verifyFolder:verify,findFilesByHash:noop,upload:stop,verifyUpload:verify},content:{loadBytes:stop}}
  await assert.rejects(()=>executor({caseImportId:value.caseImportId,adapters,now:()=>NOW}),/STOP_AFTER_PERSISTED_AUTHORIZATION/)
  assert.equal(pool.state.queries.length,1)
})

const keyConfig = (...items) => ({ SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: JSON.stringify(items) })
const publicEntry = (issuer="fixture-authority", publicKey=keys.publicKey) => ({ issuer, algorithm:"Ed25519", publicKeyPem:publicKey.export({type:"spki",format:"pem"}) })
test("chave pública é configuração explícita Ed25519", () => { const env=keyConfig(publicEntry());assert(trustedPublicKeysFromEnv(env)["fixture-authority"]);assert(createSingleCaseAuthorizationComponents({pool:memoryPool(),env}).authorizationRepository) })
test("chave pública ausente ou inválida falha fechado", () => { assert.throws(()=>trustedPublicKeysFromEnv({}),/PUBLIC_KEYS_MISSING/);assert.throws(()=>trustedPublicKeysFromEnv({SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON:"{}"}),/PUBLIC_KEYS_INVALID/);assert.throws(()=>trustedPublicKeysFromEnv({SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON:JSON.stringify({issuer:"bad"})}),/PUBLIC_KEYS_INVALID/) })
test("dois emissores válidos têm ordem determinística", () => { const other=crypto.generateKeyPairSync("ed25519");const a=trustedPublicKeysFromEnv(keyConfig(publicEntry("issuer-z",other.publicKey),publicEntry("issuer-a")));const b=trustedPublicKeysFromEnv(keyConfig(publicEntry("issuer-a"),publicEntry("issuer-z",other.publicKey)));assert.deepEqual(Object.keys(a),Object.keys(b));assert.deepEqual(Object.keys(a),["issuer-a","issuer-z"]) })
test("emissor ou chave duplicados são rejeitados", () => { const entry=publicEntry();assert.throws(()=>trustedPublicKeysFromEnv(keyConfig(entry,{...entry})),/PUBLIC_KEYS_DUPLICATE/);assert.throws(()=>trustedPublicKeysFromEnv(keyConfig(entry,{...entry,issuer:"fixture-other"})),/PUBLIC_KEYS_DUPLICATE/) })
test("itens incompletos, extras, array vazio e formato antigo são rejeitados", () => { assert.throws(()=>trustedPublicKeysFromEnv(keyConfig()),/PUBLIC_KEYS_INVALID/);assert.throws(()=>trustedPublicKeysFromEnv(keyConfig({issuer:"fixture-authority",publicKeyPem:publicEntry().publicKeyPem})),/PUBLIC_KEYS_INVALID/);assert.throws(()=>trustedPublicKeysFromEnv(keyConfig({...publicEntry(),extra:true})),/PUBLIC_KEYS_INVALID/);assert.throws(()=>trustedPublicKeysFromEnv({SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON:JSON.stringify({"fixture-authority":publicEntry().publicKeyPem})}),/PUBLIC_KEYS_INVALID/) })
test("chaves privadas e algoritmos não Ed25519 são recusados sem vazamento", () => { const privatePem=keys.privateKey.export({type:"pkcs8",format:"pem"}),encrypted=keys.privateKey.export({type:"pkcs8",format:"pem",cipher:"aes-256-cbc",passphrase:"fixture-passphrase"}),rsa=crypto.generateKeyPairSync("rsa",{modulusLength:2048});for(const material of [privatePem,encrypted,rsa.privateKey.export({type:"pkcs8",format:"pem"}),rsa.publicKey.export({type:"spki",format:"pem"}),"invalid",""]){let error;try{trustedPublicKeysFromEnv(keyConfig({issuer:"fixture-authority",algorithm:"Ed25519",publicKeyPem:material}))}catch(caught){error=caught}assert.match(error.message,/AUTHORIZATION_PUBLIC_KEYS_INVALID/);if(String(material).length>=20)assert.equal(error.message.includes(String(material).slice(0,20)),false)} })
test("algoritmo ausente ou divergente é recusado", () => { const entry=publicEntry();assert.throws(()=>trustedPublicKeysFromEnv(keyConfig({...entry,algorithm:undefined})),/PUBLIC_KEYS_INVALID/);assert.throws(()=>trustedPublicKeysFromEnv(keyConfig({...entry,algorithm:"RSA"})),/PUBLIC_KEYS_INVALID/) })
test("mapper rejeita emissor e assinatura estruturalmente inválidos", async () => { for(const mutate of [row=>{row.issuer=""},row=>{row.issuer="   "},row=>{row.issuer="invalid issuer"},row=>{row.signature=""},row=>{row.signature="   "},row=>{row.signature="not-base64"},row=>{row.signature=Buffer.alloc(63).toString("base64")}]){const rows=signedRows();mutate(rows[0]);await assert.rejects(()=>load(rows),/AUTHORIZATION_(ISSUER|SIGNATURE)_INVALID/)} })
test("CLI real permanece desabilitada", async () => assert.rejects(()=>cli.main({argv:["--case-import-id",plan().caseImportId]}),/REAL_SINGLE_CASE_APPLY_NOT_CONFIGURED/))
test("importação e composição não abrem conexão", () => { const pool=memoryPool();createSingleCaseAuthorizationComponents({pool,env:keyConfig(publicEntry())});assert.equal(pool.state.queries.length,0) })

function historyStore(initial=[]) {
  const rows=structuredClone(initial)
  return { rows, insert(row) { if(rows.some(item=>item.operational_status==="ACTIVE"&&row.operational_status==="ACTIVE"&&item.authorization_type===row.authorization_type&&item.case_import_id===row.case_import_id&&item.case_fingerprint===row.case_fingerprint&&item.case_number===row.case_number&&item.authorizable_plan_hash===row.authorizable_plan_hash)) throw new Error("ACTIVE_AUTHORIZATION_CONFLICT");rows.push(structuredClone(row)) } }
}
test("histórico expirado é preservado e renovação usa novo ID", async () => { const old=signedRows(plan(),r=>({...r,expiresAt:"2026-07-15T11:30:00.000Z"}))[0];old.operational_status="HISTORICAL";old.superseded_at=NOW;const store=historyStore([old]),fresh=signedRows(plan(),r=>({...r,authorizationId:`${r.authorizationId}-renewed`}))[0];store.insert(fresh);const records=(await load(store.rows)).records;assert.equal(records.length,1);assert.equal(records[0].authorizationId,fresh.authorization_id);assert.equal(store.rows[0].authorization_id,old.authorization_id);assert.notEqual(fresh.authorization_id,old.authorization_id) })
test("histórico revogado é preservado e nova autorização é operacional", async () => { const old=signedRows(plan(),r=>({...r,revoked:true}))[0];old.operational_status="HISTORICAL";old.superseded_at=NOW;const store=historyStore([old]),fresh=signedRows(plan(),r=>({...r,authorizationId:`${r.authorizationId}-replacement`}))[0];store.insert(fresh);assert.equal((await load(store.rows)).records[0].authorizationId,fresh.authorization_id);assert.equal(store.rows[0].revoked,true) })
test("duas autorizações ativas do mesmo tipo e vínculo são bloqueadas", () => { const first=signedRows()[0],store=historyStore([first]),second=signedRows(plan(),r=>({...r,authorizationId:`${r.authorizationId}-second`}))[0];assert.throws(()=>store.insert(second),/ACTIVE_AUTHORIZATION_CONFLICT/);assert.equal(store.rows.length,1) })

function schemaHarness({ migrated=false, columnMutate=row=>row, constraintMutate=rows=>rows, indexMutate=row=>row }={}) {
  const state={migrated,creates:0,inserts:0,commits:0,rollbacks:0,statements:[]}
  const columnRows=EXPECTED_COLUMNS.map(item=>columnMutate({column_name:item.name,data_type:item.type,udt_name:item.udt,is_nullable:item.nullable?"YES":"NO",column_default:item.defaultValue,ordinal_position:item.position},item))
  const checks=Object.entries(TEST_CHECKS).map(([conname,fixture])=>({conname,contype:"c",definition:fixture.expression,columns:[...fixture.columns]}))
  const constraintRows=constraintMutate([{conname:"single_case_apply_authorizations_pkey",contype:"p",definition:"PRIMARY KEY (authorization_id)",columns:["authorization_id"]},...checks])
  const indexRow=indexMutate({index_name:ACTIVE_INDEX,is_unique:true,method:"btree",table_name:TABLE_NAME,key_attribute_count:5,total_attribute_count:5,has_expressions:false,predicate:"(operational_status = 'ACTIVE'::text)",key_columns:["authorization_type","case_import_id","case_fingerprint","case_number","authorizable_plan_hash"]})
  const client={async query(sql,params=[]){const text=String(sql).replace(/\s+/g," ").trim();state.statements.push(text);if(text==="BEGIN")return{rows:[],rowCount:0};if(text==="COMMIT"){state.commits++;return{rows:[],rowCount:0}}if(text==="ROLLBACK"){state.rollbacks++;return{rows:[],rowCount:0}}if(text.includes("to_regclass('oraculum_state_migrations')"))return{rows:[{table_name:"oraculum_state_migrations"}],rowCount:1};if(text.startsWith("SELECT migration_id"))return{rows:state.migrated?[{migration_id:MIGRATION_ID}]:[],rowCount:state.migrated?1:0};if(text.startsWith("CREATE TABLE")){state.creates++;return{rows:[],rowCount:0}}if(text.includes("information_schema.columns"))return{rows:columnRows,rowCount:columnRows.length};if(text.includes("FROM pg_constraint"))return{rows:constraintRows,rowCount:constraintRows.length};if(text.includes("FROM pg_index"))return{rows:[indexRow],rowCount:1};if(text.startsWith("INSERT INTO oraculum_state_migrations")){state.migrated=true;state.inserts++;return{rows:[],rowCount:1}}throw new Error(`UNEXPECTED_SQL:${text}`)},release(){}}
  return {connect:async()=>client,query:client.query.bind(client),state}
}
async function assertMigrationRejected(options) { const validationDb=schemaHarness(options);assert.equal((await validateSingleCaseAuthorizationSchema(validationDb)).ok,false);const migrationDb=schemaHarness(options);await assert.rejects(()=>migrateSingleCaseAuthorizations(migrationDb),/SCHEMA_INCOMPATIBLE/);assert.equal(migrationDb.state.inserts,0);assert.equal(migrationDb.state.commits,0);assert.equal(migrationDb.state.rollbacks,1) }
test("schema integral correto é aceito", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness())).ok))
test("tipo incorreto é detectado", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({columnMutate:(row,item)=>item.name==="issuer"?{...row,data_type:"integer",udt_name:"int4"}:row}))).codes.includes("COLUMN_TYPE_MISMATCH")))
test("nulabilidade incorreta é detectada", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({columnMutate:(row,item)=>item.name==="issuer"?{...row,is_nullable:"YES"}:row}))).codes.includes("COLUMN_NULLABILITY_MISMATCH")))
test("default incorreto é detectado", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({columnMutate:(row,item)=>item.name==="revoked"?{...row,column_default:"true"}:row}))).codes.includes("COLUMN_DEFAULT_MISMATCH")))
test("PK incorreta é detectada", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({constraintMutate:rows=>rows.map(row=>row.contype==="p"?{...row,columns:["case_import_id"]}:row)}))).codes.includes("PRIMARY_KEY_MISMATCH")))
test("unicidade vitalícia antiga é rejeitada", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({constraintMutate:rows=>[...rows,{conname:"single_case_auth_binding_type_unique",contype:"u",definition:"UNIQUE",columns:["authorization_type"]}]}))).codes.includes("LIFETIME_UNIQUE_PRESENT")))
test("CHECK homônimo permissivo é detectado", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({constraintMutate:rows=>rows.map(row=>row.conname==="single_case_auth_issuer_check"?{...row,definition:"CHECK (issuer IS NOT NULL)"}:row)}))).codes.includes("CHECK_CONSTRAINT_MISMATCH")))
test("CHECK associado a coluna errada é detectado", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({constraintMutate:rows=>rows.map(row=>row.conname==="single_case_auth_issuer_check"?{...row,columns:["signature"]}:row)}))).codes.includes("CHECK_CONSTRAINT_MISMATCH")))
test("predicado parcial divergente é detectado", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({indexMutate:row=>({...row,predicate:"operational_status = 'HISTORICAL'"})}))).codes.includes("ACTIVE_UNIQUE_INDEX_MISMATCH")))
test("colunas divergentes do índice parcial são detectadas", async () => assert((await validateSingleCaseAuthorizationSchema(schemaHarness({indexMutate:row=>({...row,key_columns:["authorization_type","case_import_id"],key_attribute_count:2,total_attribute_count:2})}))).codes.includes("ACTIVE_UNIQUE_INDEX_MISMATCH")))
test("migração é idempotente e usa uma única fonte DDL", async () => { const db=schemaHarness();assert((await migrateSingleCaseAuthorizations(db)).applied);assert.equal((await migrateSingleCaseAuthorizations(db)).applied,false);assert.deepEqual({creates:db.state.creates,inserts:db.state.inserts},{creates:1,inserts:1});assert(db.state.statements.includes(CREATE_TABLE_SQL.replace(/\s+/g," ").trim())) })
test("divergência impede registro e causa rollback", async () => { const db=schemaHarness({columnMutate:(row,item)=>item.name==="issuer"?{...row,data_type:"integer"}:row});await assert.rejects(()=>migrateSingleCaseAuthorizations(db),/SCHEMA_INCOMPATIBLE/);assert.equal(db.state.inserts,0);assert.equal(db.state.commits,0);assert.equal(db.state.rollbacks,1) })

test("check de schema com OR adicional rejeita e faz rollback", async () => assertMigrationRejected({constraintMutate:rows=>rows.map(row=>row.conname==="single_case_auth_schema_check"?{...row,definition:"CHECK (schema_version = 1 OR schema_version = 2)"}:row)}))
test("check de tipos com EXTRA rejeita e faz rollback", async () => assertMigrationRejected({constraintMutate:rows=>rows.map(row=>row.conname==="single_case_auth_type_check"?{...row,definition:"CHECK (authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION','EXTERNAL_WRITES_AUTHORIZATION','EXTRA'))"}:row)}))
test("check de assinatura com alternativa inválida rejeita e faz rollback", async () => assertMigrationRejected({constraintMutate:rows=>rows.map(row=>row.conname==="single_case_auth_signature_check"?{...row,definition:"CHECK (signature ~ '^[A-Za-z0-9+/]{86}==$' OR signature = 'valor-invalido')"}:row)}))
test("check de algoritmo com alternativa rejeita e faz rollback", async () => assertMigrationRejected({constraintMutate:rows=>rows.map(row=>row.conname==="single_case_auth_algorithm_check"?{...row,definition:"CHECK (signature_algorithm = 'Ed25519' OR signature_algorithm = 'Outro')"}:row)}))
test("check com formatação e parênteses redundantes é aceito", async () => { const db=schemaHarness({constraintMutate:rows=>rows.map(row=>row.conname==="single_case_auth_schema_check"?{...row,definition:"  CHECK ( ( ( schema_version = 1 ) ) )  "}:row)});assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok,true) })
test("índice com coluna adicional rejeita e faz rollback", async () => assertMigrationRejected({indexMutate:row=>({...row,key_columns:[...row.key_columns,"issuer"],key_attribute_count:6,total_attribute_count:6})}))
test("índice com predicado AND adicional rejeita e faz rollback", async () => assertMigrationRejected({indexMutate:row=>({...row,predicate:"operational_status = 'ACTIVE' AND issuer = 'x'"})}))
test("índice com predicado OR adicional rejeita e faz rollback", async () => assertMigrationRejected({indexMutate:row=>({...row,predicate:"operational_status = 'ACTIVE' OR issuer = 'x'"})}))
test("índice com ordem divergente rejeita e faz rollback", async () => assertMigrationRejected({indexMutate:row=>({...row,key_columns:[row.key_columns[1],row.key_columns[0],...row.key_columns.slice(2)]})}))
test("índice com INCLUDE adicional rejeita e faz rollback", async () => assertMigrationRejected({indexMutate:row=>({...row,total_attribute_count:6})}))
test("índice com expressão rejeita e faz rollback", async () => assertMigrationRejected({indexMutate:row=>({...row,has_expressions:true})}))
test("índice estrutural integral correto é aceito", async () => assert.equal((await validateSingleCaseAuthorizationSchema(schemaHarness())).ok,true))

// Regression and strict-format tests for the normalizer (only JS arrays or JSON-string arrays are accepted)
test("constraint columns provided as JSON string array are accepted", async () => {
  const db = schemaHarness({
    constraintMutate: rows => rows.map(row => ({ ...row, columns: JSON.stringify(Array.isArray(row.columns) ? row.columns : []) }))
  })
  assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok, true)
})

test("index key_columns provided as JSON string array are accepted", async () => {
  const db = schemaHarness({
    indexMutate: row => ({ ...row, key_columns: JSON.stringify(row.key_columns), key_attribute_count: row.key_attribute_count, total_attribute_count: row.total_attribute_count })
  })
  assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok, true)
})

test("object (non-array) returned for constraint columns is rejected", async () => {
  const db = schemaHarness({
    constraintMutate: rows => rows.map(row => ({ ...row, columns: JSON.stringify({ not: "an array" }) }))
  })
  assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok, false)
})

test("arbitrary string returned for index key_columns is rejected", async () => {
  const db = schemaHarness({ indexMutate: row => ({ ...row, key_columns: "not-a-json-array", key_attribute_count: row.key_attribute_count, total_attribute_count: row.total_attribute_count }) })
  assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok, false)
})

test("array containing non-string element is rejected", async () => {
  const db = schemaHarness({ constraintMutate: rows => rows.map(row => ({ ...row, columns: [1, ...row.columns.slice(1)] })) })
  assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok, false)
})

test("array containing empty string element is rejected", async () => {
  const db = schemaHarness({ constraintMutate: rows => rows.map(row => ({ ...row, columns: ["", ...row.columns.slice(1)] })) })
  assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok, false)
})

test("null for required columns is rejected", async () => {
  const db = schemaHarness({ constraintMutate: rows => rows.map(row => ({ ...row, columns: null })) })
  assert.equal((await validateSingleCaseAuthorizationSchema(db)).ok, false)
})
