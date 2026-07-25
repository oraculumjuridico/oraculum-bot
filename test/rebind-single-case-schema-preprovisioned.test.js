"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const { parseArgs, main, SCHEMA_PREPROVISIONED_ARGUMENT } = require("../scripts/rebind-single-case")
const { MIGRATION_ID, validateProvisionedSingleCaseRebindAuditSchema } = require("../src/infrastructure/single-case-rebind-postgres")

const caseImportId = "case-import-synthetic-001"
const authorizationIds = ["auth-id-gamma-11111", "auth-id-delta-22222"]
const baseArgv = ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "CONTACT_RECONCILED_AFTER_DIVERGENCE", "--reconciliation-evidence-file", "unused.json", "--new-authorization-ids", JSON.stringify(authorizationIds)]
const evidence = { decision:"RECONCILIATION_ELIGIBLE",reason:"CONTACT_READ_ONLY_VERIFIED",contactEvidence:{caseImportId,contactId:"contact-123",verified:true},namePresentation:{semanticMatch:true,materialDivergence:false},resume:{checkpointRebindRequired:true,ambiguity:"NONE"},evidenceHash:"a".repeat(64) }

function schemaRows() {
  const specs = [
    ["rebind_id","text","text",false,null],["case_import_id","text","text",false,null],["source_checkpoint_version","bigint","int8",false,null],["rebound_checkpoint_version","bigint","int8",false,null],["authorization_count","integer","int4",false,null],["previous_authorization_set_hash","text","text",false,null],["current_authorization_set_hash","text","text",false,null],["reconciliation_evidence_hash","text","text",true,null],["reason","text","text",false,null],["requested_by","text","text",false,null],["fencing_token","bigint","int8",false,null],["lease_id","text","text",false,null],["committed_at","timestamp with time zone","timestamptz",false,"current_timestamp"]
  ]
  return specs.map(([column_name,data_type,udt_name,nullable,column_default], index) => ({ column_name,data_type,udt_name,is_nullable:nullable?"YES":"NO",column_default,ordinal_position:index+1 }))
}

function constraintRows() {
  const checks = {
    single_case_rebind_audit_rebind_id_check:["rebind_id","CHECK ((rebind_id ~ '^[a-f0-9]{64}$'::text))"],
    single_case_rebind_audit_case_id_check:["case_import_id","CHECK ((case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'::text))"],
    single_case_rebind_audit_source_version_check:["source_checkpoint_version","CHECK ((source_checkpoint_version > 0))"],
    single_case_rebind_audit_rebound_version_check:[["rebound_checkpoint_version","source_checkpoint_version"],"CHECK ((rebound_checkpoint_version = (source_checkpoint_version + 1)))"],
    single_case_rebind_audit_auth_count_check:["authorization_count","CHECK ((authorization_count = 2))"],
    single_case_rebind_audit_previous_hash_check:["previous_authorization_set_hash","CHECK ((previous_authorization_set_hash ~ '^[a-f0-9]{64}$'::text))"],
    single_case_rebind_audit_current_hash_check:["current_authorization_set_hash","CHECK ((current_authorization_set_hash ~ '^[a-f0-9]{64}$'::text))"],
    single_case_rebind_audit_evidence_hash_check:["reconciliation_evidence_hash","CHECK ((reconciliation_evidence_hash ~ '^[a-f0-9]{64}$'::text))"],
    single_case_rebind_audit_reason_check:["reason","CHECK ((reason = ANY(ARRAY['CONTACT_RECONCILED_AFTER_DIVERGENCE'::text, 'PLAN_REGENERATED_AFTER_SAFE_CORRECTION'::text, 'AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY'::text])))"],
    single_case_rebind_audit_requested_by_check:["requested_by","CHECK ((requested_by ~ '^[A-Za-z][A-Za-z0-9._:-]{2,63}$'::text))"],
    single_case_rebind_audit_token_check:["fencing_token","CHECK ((fencing_token > 0))"],
    single_case_rebind_audit_lease_id_check:["lease_id","CHECK ((lease_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'::text))"]
  }
  return [{ conname:"single_case_rebind_audit_pkey",contype:"p",definition:"PRIMARY KEY (rebind_id)",columns:["rebind_id"] }, ...Object.entries(checks).map(([conname,[columns,definition]]) => ({ conname,contype:"c",definition,columns:Array.isArray(columns)?columns:[columns] }))]
}

function indexRows() {
  return [
    { schema_name:"public",table_name:"single_case_apply_rebind_audit",index_name:"single_case_rebind_audit_case_committed_idx",is_unique:false,method:"btree",key_attribute_count:2,total_attribute_count:2,has_expressions:false,has_predicate:false,key_columns:["case_import_id","committed_at"],key_descending:[false,true] },
    { schema_name:"public",table_name:"single_case_apply_rebind_audit",index_name:"single_case_rebind_audit_case_source_current_idx",is_unique:true,method:"btree",key_attribute_count:3,total_attribute_count:3,has_expressions:false,has_predicate:false,key_columns:["case_import_id","source_checkpoint_version","current_authorization_set_hash"],key_descending:[false,false,false] }
  ]
}

function validationPool({ ledger=true, migration=true, divergent=false, divergentIndex=false, indexMutation=null, indexFormat="array", failAt=null } = {}) {
  const state = { statements:[], released:false }
  const client = { async query(sql) {
    const text=String(sql); state.statements.push(text)
    if(failAt && text.includes(failAt)) throw new Error("raw-sensitive-detail")
    if(text==="BEGIN READ ONLY"||text==="ROLLBACK"||text.startsWith("SET LOCAL")) return {rowCount:0,rows:[]}
    if(text.includes("to_regclass('oraculum_state_migrations')")) return {rowCount:1,rows:[{table_name:ledger?"oraculum_state_migrations":null}]}
    if(text.includes("SELECT migration_id")) return {rowCount:migration?1:0,rows:migration?[{migration_id:MIGRATION_ID}]:[]}
    if(text.includes("information_schema.columns")) { const rows=schemaRows(); if(divergent) rows[0].data_type="integer"; return {rowCount:rows.length,rows} }
    if(text.includes("FROM pg_constraint")) { const rows=constraintRows(); return {rowCount:rows.length,rows} }
    if(text.includes("FROM pg_index")) {
      const rows=indexRows(); if(divergentIndex) rows[0].key_columns.reverse(); if(indexMutation) indexMutation(rows)
      if(indexFormat==="postgres") for(const row of rows){row.key_columns=`{${row.key_columns.join(",")}}`;row.key_descending=`{${row.key_descending.map(Boolean).map(x=>x?"t":"f").join(",")}}`}
      if(indexFormat==="numeric") for(const row of rows)row.key_descending=row.key_descending.map(x=>x?1:0)
      return {rowCount:rows.length,rows}
    }
    throw new Error("unexpected")
  }, release(){state.released=true} }
  return { state, connect:async()=>client }
}

test("argumento --schema-preprovisioned e reconhecido sem alterar os demais", () => {
  assert.equal(SCHEMA_PREPROVISIONED_ARGUMENT, "--schema-preprovisioned")
  assert.equal(parseArgs(baseArgv).schemaPreprovisioned, false)
  assert.equal(parseArgs([...baseArgv, SCHEMA_PREPROVISIONED_ARGUMENT]).schemaPreprovisioned, true)
})

test("modo padrao chama migracao e preserva fluxo", async () => {
  let migrated=0,validated=0,executed=0
  const result=await runMain(baseArgv,{migrateSchema:async()=>{migrated++},validateProvisionedSchema:async()=>{validated++},execute:async()=>{executed++;return rebindResult()}})
  assert.equal(migrated,1);assert.equal(validated,0);assert.equal(executed,1);assert.equal(result.status,"rebound")
})

test("modo provisionado valido ignora migracao, valida e prossegue", async () => {
  let migrated=0,validated=0,constructed=0,executed=0
  await runMain([...baseArgv,SCHEMA_PREPROVISIONED_ARGUMENT],{migrateSchema:async()=>{migrated++},validateProvisionedSchema:async()=>{validated++},onConstruct:()=>{constructed++},execute:async()=>{executed++;return rebindResult()}})
  assert.equal(migrated,0);assert.equal(validated,1);assert.equal(constructed,1);assert.equal(executed,1)
})

for (const [name,options,code] of [
  ["ledger ausente",{ledger:false},"REBIND_SCHEMA_LEDGER_MISSING"],
  ["migration_id ausente",{migration:false},"REBIND_SCHEMA_MIGRATION_NOT_APPLIED"],
  ["schema divergente",{divergent:true},"REBIND_SCHEMA_INVALID"]
]) test(name+" falha fechado sem operacao", async()=>{
  const pool=validationPool(options)
  await assert.rejects(validateProvisionedSingleCaseRebindAuditSchema(pool),new RegExp(code))
  assert(pool.state.statements.includes("ROLLBACK"));assert.equal(pool.state.released,true)
})

test("indice divergente falha fechado",async()=>{
  const pool=validationPool({divergentIndex:true})
  await assert.rejects(validateProvisionedSingleCaseRebindAuditSchema(pool),/REBIND_SCHEMA_INVALID/)
  assert(pool.state.statements.includes("ROLLBACK"));assert.equal(pool.state.released,true)
})

for(const [name,indexMutation] of [
  ["indice ausente",rows=>rows.pop()],
  ["nome correto com coluna errada",rows=>{rows[0].key_columns[0]="wrong_column"}],
  ["ordem de colunas invertida",rows=>{rows[1].key_columns.reverse()}],
  ["unicidade divergente",rows=>{rows[1].is_unique=false}],
  ["coluna chave extra",rows=>{rows[1].key_columns.push("extra_column");rows[1].key_descending.push(false);rows[1].key_attribute_count=4;rows[1].total_attribute_count=4}],
  ["INCLUDE inesperado",rows=>{rows[1].total_attribute_count=4}]
]) test(name+" e rejeitado",async()=>{
  await assert.rejects(validateProvisionedSingleCaseRebindAuditSchema(validationPool({indexMutation})),/REBIND_SCHEMA_INVALID/)
})

for(const indexFormat of ["array","postgres","numeric"]) test("formato de indice "+indexFormat+" e normalizado",async()=>{
  assert.deepEqual(await validateProvisionedSingleCaseRebindAuditSchema(validationPool({indexFormat})),{valid:true,migrationId:MIGRATION_ID})
})

test("SQLSTATE inesperado em indices e sanitizado com rollback e release",async()=>{
  const pool=validationPool({failAt:"FROM pg_index"})
  await assert.rejects(validateProvisionedSingleCaseRebindAuditSchema(pool),/REBIND_SCHEMA_READ_ONLY_VALIDATION_FAILED/)
  assert(pool.state.statements.includes("ROLLBACK"));assert.equal(pool.state.released,true)
})

for (const code of ["REBIND_SCHEMA_LEDGER_MISSING","REBIND_SCHEMA_MIGRATION_NOT_APPLIED","REBIND_SCHEMA_INVALID"]) test(code+" bloqueia main antes de migracao e repositorio",async()=>{
  let migrated=0,constructed=0,executed=0
  await assert.rejects(runMain([...baseArgv,SCHEMA_PREPROVISIONED_ARGUMENT],{
    migrateSchema:async()=>{migrated++},
    validateProvisionedSchema:async()=>{throw new Error(code)},
    onConstruct:()=>{constructed++},
    execute:async()=>{executed++;return rebindResult()}
  }),new RegExp(code))
  assert.equal(migrated,0);assert.equal(constructed,0);assert.equal(executed,0)
})

test("validacao usa BEGIN READ ONLY, ROLLBACK e nenhum verbo de escrita", async()=>{
  const pool=validationPool();assert.deepEqual(await validateProvisionedSingleCaseRebindAuditSchema(pool),{valid:true,migrationId:MIGRATION_ID})
  assert(pool.state.statements.includes("BEGIN READ ONLY"));assert(pool.state.statements.includes("ROLLBACK"));assert(pool.state.statements.some(x=>x.includes("statement_timeout")));assert(pool.state.statements.some(x=>x.includes("lock_timeout")))
  assert.equal(pool.state.statements.some(x=>/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(x)),false)
})

test("falha inesperada faz rollback, libera cliente e nao inicia operacao", async()=>{
  const pool=validationPool({failAt:"information_schema.columns"})
  await assert.rejects(validateProvisionedSingleCaseRebindAuditSchema(pool),/REBIND_SCHEMA_READ_ONLY_VALIDATION_FAILED/)
  assert(pool.state.statements.includes("ROLLBACK"));assert.equal(pool.state.released,true)
})

function rebindResult(){return {rebindId:"b".repeat(64),status:"rebound",sourceCheckpointVersion:1,reboundCheckpointVersion:2}}
async function runMain(argv,{migrateSchema,validateProvisionedSchema,onConstruct=()=>{},execute}){
  const pool={
    query:async sql=>String(sql).includes("checkpoint_payload")
      ? {rowCount:1,rows:[{checkpoint_payload:{version:1,authorizationIds:["auth-id-alpha-12345","auth-id-beta-67890"]}}]}
      : {rowCount:1,rows:[{committed_at:"2026-01-01T00:00:00.000Z"}]},
    end:async()=>{}
  }
  return main({argv,configReader:async()=>({connectionString:"postgres://redacted",env:{}}),poolFactory:()=>pool,migrateSchema,validateProvisionedSchema,evidenceLoader:async()=>evidence,coordinationFactory:()=>({acquireLease:async()=>({caseImportId,leaseId:"lease-fixture-rebind",fencingToken:7,owner:"single-case-real-composition"}),releaseLease:async()=>({released:true})}),repositoryFactory:()=>{onConstruct();return{executeRebind:execute}}})
}
