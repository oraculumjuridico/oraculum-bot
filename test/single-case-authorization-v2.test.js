"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { AUTHORIZATION_SCHEMA_VERSION, MAX_AUTHORIZATION_TTL_MS, AUTH_SCOPES, MINIMUM_REMAINING_TTL_MS, authorizationPayload, createAuthorizationVerifier, reservationEvidenceHash, validateAuthorizations } = require("../src/domain/single-case-apply-contracts")
const { createSingleCaseAuthorizationSigner } = require("../src/domain/single-case-authorization-signer")

const NOW = "2026-07-15T12:00:00.000Z", keys = crypto.generateKeyPairSync("ed25519"), issuer = "fixture-v2-authority"
const HASHES = { authorizablePlanHash: "a".repeat(64), planHash: "b".repeat(64), manifestHash: "c".repeat(64), reservationEvidenceHash: "d".repeat(64) }
const base = (type = "EXPLICIT_APPLY_AUTHORIZATION") => ({ authorizationId: `fixture-v2-${type.toLowerCase()}`, schemaVersion: AUTHORIZATION_SCHEMA_VERSION, type, caseImportId: "fixture-v2-case", caseFingerprint: "abcdef123456", caseNumber: "PRV.260715.707", ...HASHES, scope: [...AUTH_SCOPES[type]], issuer, issuedAt: "2026-07-15T11:45:00.000Z", expiresAt: "2026-07-15T12:15:00.000Z", revoked: false })
const signer = () => createSingleCaseAuthorizationSigner({ privateKey: keys.privateKey, clock: () => NOW })
const verifier = createAuthorizationVerifier({ trustedIssuers: { [issuer]: keys.publicKey } })
const expected = { caseImportId: "fixture-v2-case", caseFingerprint: "abcdef123456", caseNumber: "PRV.260715.707", ...HASHES }

test("signer Ed25519 e verifier aceitam v2 válido", () => { const record=signer().sign(base());assert.equal(record.algorithm,"Ed25519");assert.equal(verifier.verify(record,{now:NOW}).valid,true) })
test("canonicalização da assinatura é determinística", () => { const a=base(),b={...a,scope:[...a.scope].reverse()};assert.equal(signer().sign(a).proof,signer().sign(b).proof) })
test("chave ausente ou inválida é sanitizada", () => { assert.throws(()=>createSingleCaseAuthorizationSigner({clock:()=>NOW}),/PRIVATE_KEY_MISSING/);let error;try{createSingleCaseAuthorizationSigner({privateKey:"segredo-privado",clock:()=>NOW})}catch(e){error=e}assert.match(error.message,/PRIVATE_KEY_INVALID/);assert.equal(error.message.includes("segredo-privado"),false) })
for(const type of Object.keys(AUTH_SCOPES)) {
  const typeScope = AUTH_SCOPES[type]
  for(const [name,scope] of [["ausente",typeScope.slice(1)],["adicional",[...typeScope,"EXTRA"]],["duplicado",[...typeScope,typeScope[0]]]]) test(`${type}: escopo ${name} é rejeitado`,()=>assert.throws(()=>signer().sign({...base(type),scope}),/AUTH_SCOPE_INVALID/))
  test(`${type}: diferença de caixa é rejeitada`,()=>assert.throws(()=>signer().sign({...base(type),scope:typeScope.map((x,i)=>i?x:x.toLowerCase())}),/AUTH_SCOPE_INVALID/))
}
test("TTL excessivo é rejeitado",()=>assert.throws(()=>signer().sign({...base(),expiresAt:new Date(Date.parse(base().issuedAt)+MAX_AUTHORIZATION_TTL_MS+1).toISOString()}),/AUTH_TTL_EXCEEDED/))
test("expirada é rejeitada",()=>assert.throws(()=>signer().sign({...base(),issuedAt:"2026-07-15T11:00:00.000Z",expiresAt:"2026-07-15T11:30:00.000Z"}),/AUTH_EXPIRED/))
test("schema v1 é rejeitado",()=>assert.throws(()=>signer().sign({...base(),schemaVersion:1}),/AUTH_SCHEMA_INVALID/))
test("assinatura inválida e payload mutado são rejeitados",()=>{const record=signer().sign(base());assert.equal(verifier.verify({...record,proof:""},{now:NOW}).reason,"AUTH_PROOF_INVALID");assert.equal(verifier.verify({...record,planHash:"e".repeat(64)},{now:NOW}).reason,"AUTH_PROOF_INVALID")})
test("três hashes não possuem fallback",()=>{for(const key of ["authorizablePlanHash","planHash","manifestHash","reservationEvidenceHash"])assert.throws(()=>signer().sign({...base(),[key]:undefined}),/AUTH_HASH_INVALID/)})
test("bindings divergentes são rejeitados",()=>{const records=[signer().sign(base()),signer().sign(base("EXTERNAL_WRITES_AUTHORIZATION"))];for(const key of ["planHash","manifestHash","reservationEvidenceHash"]){assert.throws(()=>validateAuthorizations(records,{...expected,[key]:"f".repeat(64)},verifier,NOW),/AUTH_BINDING_INVALID/)}})
test("evidência de reserva é canônica e estrita",()=>{const a={verified:true,evidenceId:"reservation-fixture",caseImportId:"fixture-v2-case",caseNumber:"PRV.260715.707"};assert.equal(reservationEvidenceHash(a),reservationEvidenceHash({caseNumber:a.caseNumber,caseImportId:a.caseImportId,evidenceId:a.evidenceId,verified:true}));assert.throws(()=>reservationEvidenceHash({...a,evidenceId:null}),/RESERVATION_EVIDENCE_INVALID/)})
test("payload v2 contém hashes distintos e escopo ordenado",()=>{const value=authorizationPayload(base());assert.match(value,/authorizablePlanHash/);assert.match(value,/planHash/);assert.match(value,/manifestHash/);assert.match(value,/reservationEvidenceHash/)})
test("assinatura dummy é rejeitada",()=>{const record=signer().sign(base());assert.equal(verifier.verify({...record,proof:Buffer.from("dummy").toString("base64")},{now:NOW}).reason,"AUTH_PROOF_INVALID")})
test("prova malformada retorna AUTH_PROOF_INVALID",()=>{const record=signer().sign(base());assert.equal(verifier.verify({...record,proof:"not-valid-base64!!!"},{now:NOW}).reason,"AUTH_PROOF_INVALID")})
test("assinatura com comprimento Ed25519 inválido é rejeitada",()=>{const record=signer().sign(base());assert.equal(verifier.verify({...record,proof:"YWJj"},{now:NOW}).reason,"AUTH_PROOF_INVALID")})
test("tempo restante insuficiente bloqueia emissão",()=>assert.throws(()=>signer().sign({...base(),issuedAt:NOW,expiresAt:new Date(Date.parse(NOW)+MINIMUM_REMAINING_TTL_MS-1).toISOString()}),/AUTH_INSUFFICIENT_REMAINING_TTL/))
