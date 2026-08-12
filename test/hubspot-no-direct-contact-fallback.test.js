"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const start = source.indexOf("async function capturarLeadIncompleto")
const end = source.indexOf("async function", start + 30)
const block = source.slice(start, end > start ? end : source.length)

assert.doesNotMatch(block, /axios\.post\(\s*["']https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/contacts["']/)
assert.match(block, /hsCriarContato\(/)

console.log("hubspot-no-direct-contact-fallback.test.js: ok")
