"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const apiPath = path.join(__dirname, "..", "deploy", "lightning", "tts_api.py")
const source = fs.readFileSync(apiPath, "utf8")

assert.match(source, /DEFAULT_VOICE = "F4"/)
assert.match(source, /AVAILABLE_VOICES = \("F1", "F2", "F3", "F4", "F5"\)/)
assert.match(source, /class TTSRequest\(BaseModel\):\s+text: str/)
assert.doesNotMatch(source, /class TTSRequest\(BaseModel\):[\s\S]{0,120}\bvoice:/)
assert.match(source, /alias="X-Oraculum-Voice"/)
assert.match(source, /lang="pt"/)
assert.match(source, /total_steps=8/)
assert.match(source, /speed=0\.90/)
assert.match(source, /SENTENCE_PAUSE_SECONDS = 0\.4/)
assert.match(source, /r"\[\^\.\?!\]\+\(\?:\[\.\?!\]\+\|\$\)"/)
assert.doesNotMatch(source, /\[\^,\.\?!\]/)
assert.match(source, /sentenceCount=sentence_count/)
assert.match(source, /segmentIndex=indice/)
assert.match(source, /segmentDurationMs=/)
assert.match(source, /totalSynthesisDurationMs=/)

console.log("lightning-multivoice-contract.test.js: ok")
