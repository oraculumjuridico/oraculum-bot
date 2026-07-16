"use strict"
const test=require("node:test"),assert=require("node:assert/strict")
const {createSingleCaseReservationAdapter}=require("../src/adapters/single-case-reservation-adapter")
const ID="pilot-case-2",NUMBER="PRV.260714.707"
const adapter=record=>createSingleCaseReservationAdapter({expectedCaseNumber:NUMBER,repository:{findByKey:async()=>record}})
test("reserva válida",async()=>assert.deepEqual(await adapter({reservation_key:`case-import:${ID}`,case_number:NUMBER,status:"reserved"}).verify(ID,NUMBER),{verified:true,caseImportId:ID,caseNumber:NUMBER,evidenceId:`reservation:${ID}`}))
test("reserva ausente",async()=>assert.rejects(()=>adapter(null).verify(ID,NUMBER),/RESERVATION_NOT_FOUND/))
test("número divergente",async()=>assert.rejects(()=>adapter({reservation_key:`case-import:${ID}`,case_number:"PRV.260714.999",status:"reserved"}).verify(ID,NUMBER),/RESERVATION_CASE_NUMBER_MISMATCH/))
test("caso divergente",async()=>assert.rejects(()=>adapter({reservation_key:"case-import:other-case",case_number:NUMBER,status:"reserved"}).verify(ID,NUMBER),/RESERVATION_CASE_MISMATCH/))
test("estado inválido",async()=>assert.rejects(()=>adapter({reservation_key:`case-import:${ID}`,case_number:NUMBER,status:"released"}).verify(ID,NUMBER),/RESERVATION_STATUS_INVALID/))
test("repository ausente",()=>assert.throws(()=>createSingleCaseReservationAdapter(),/RESERVATION_REPOSITORY_MISSING/))
test("somente leitura",async()=>{let reads=0;const repository={findByKey:async()=>{reads++;return{reservation_key:`case-import:${ID}`,case_number:NUMBER,status:"reserved"}},reserve:()=>assert.fail(),release:()=>assert.fail()};await createSingleCaseReservationAdapter({repository,expectedCaseNumber:NUMBER}).verify(ID,NUMBER);assert.equal(reads,1)})
