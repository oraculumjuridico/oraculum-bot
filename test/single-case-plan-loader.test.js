"use strict"
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),os=require("node:os"),path=require("node:path")
const {createSingleCasePlanLoader}=require("../src/adapters/single-case-plan-loader")
const {caseFingerprintFor}=require("../src/domain/single-case-target")
const ID="pilot-case-2",NUMBER="PRV.260714.707",FP=caseFingerprintFor(ID)
const plan=()=>({caseImportId:ID,safeToApply:false,dealPlan:{caseNumber:NUMBER}})
async function root(){return fs.mkdtemp(path.join(os.tmpdir(),"plan-loader-"))}
async function write(dir,name,value){await fs.writeFile(path.join(dir,name),typeof value==="string"?value:JSON.stringify(value))}
test("plano encontrado retorna cópia sem mutação",async()=>{const dir=await root();try{await write(dir,"one.json",plan());const loader=createSingleCasePlanLoader({root:dir,expectedFingerprint:FP,expectedCaseNumber:NUMBER});const a=await loader.loadByCaseImportId(ID);a.dealPlan.caseNumber="XXX";const b=await loader.loadByCaseImportId(ID);assert.equal(b.dealPlan.caseNumber,NUMBER);assert.equal(b.safeToApply,false)}finally{await fs.rm(dir,{recursive:true,force:true})}})
test("plano ausente",async()=>{const dir=await root();try{await assert.rejects(()=>createSingleCasePlanLoader({root:dir}).loadByCaseImportId(ID),/PLAN_NOT_FOUND/)}finally{await fs.rm(dir,{recursive:true,force:true})}})
test("múltiplos planos",async()=>{const dir=await root();try{await write(dir,"a.json",plan());await write(dir,"b.json",plan());await assert.rejects(()=>createSingleCasePlanLoader({root:dir}).loadByCaseImportId(ID),/PLAN_AMBIGUOUS/)}finally{await fs.rm(dir,{recursive:true,force:true})}})
test("JSON inválido",async()=>{const dir=await root();try{await write(dir,"bad.json","{");await assert.rejects(()=>createSingleCasePlanLoader({root:dir}).loadByCaseImportId(ID),/PLAN_JSON_INVALID/)}finally{await fs.rm(dir,{recursive:true,force:true})}})
test("fingerprint divergente",async()=>{const dir=await root();try{await write(dir,"one.json",plan());await assert.rejects(()=>createSingleCasePlanLoader({root:dir,expectedFingerprint:"0".repeat(12)}).loadByCaseImportId(ID),/PLAN_FINGERPRINT_MISMATCH/)}finally{await fs.rm(dir,{recursive:true,force:true})}})
test("número divergente",async()=>{const dir=await root();try{await write(dir,"one.json",plan());await assert.rejects(()=>createSingleCasePlanLoader({root:dir,expectedCaseNumber:"PRV.260714.999"}).loadByCaseImportId(ID),/PLAN_CASE_NUMBER_MISMATCH/)}finally{await fs.rm(dir,{recursive:true,force:true})}})
test("path traversal no identificador",async()=>{const dir=await root();try{await assert.rejects(()=>createSingleCasePlanLoader({root:dir}).loadByCaseImportId("../secret"),/PLAN_CASE_IMPORT_ID_INVALID/)}finally{await fs.rm(dir,{recursive:true,force:true})}})
test("raiz ausente",()=>assert.throws(()=>createSingleCasePlanLoader(),/PLAN_ROOT_MISSING/))
