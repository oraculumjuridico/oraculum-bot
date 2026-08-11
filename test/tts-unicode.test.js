const assert = require("node:assert/strict")
const fs = require("node:fs")
const axios = require("axios")
const childProcess = require("node:child_process")

const originalGet = axios.get
const originalExecFileSync = childProcess.execFileSync
const ttsPath = require.resolve("../tts")
const receivedTexts = []

async function run() {
  axios.get = async (_url, options) => {
    receivedTexts.push(options.params.q)
    return { data: Buffer.from("fake-mp3") }
  }
  childProcess.execFileSync = (_command, args) => {
    fs.writeFileSync(args[args.length - 1], Buffer.from("fake-ogg-opus"))
  }
  delete require.cache[ttsPath]

  const { gerarAudioAtendente } = require(ttsPath)
  const originalText = "Atenção: você receberá informações sobre ação, perícia e coração."
  const output = await gerarAudioAtendente("Helena", originalText)

  try {
    assert.equal(receivedTexts.join(" "), originalText)
    assert.match(receivedTexts.join(" "), /Atenção/)
    assert.match(receivedTexts.join(" "), /você/)
    assert.match(receivedTexts.join(" "), /ação/)
    assert.match(receivedTexts.join(" "), /perícia/)
    assert.equal(output.endsWith(".ogg"), true)
  } finally {
    try { fs.unlinkSync(output) } catch {}
  }
}

run()
  .then(() => console.log("tts-unicode.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    axios.get = originalGet
    childProcess.execFileSync = originalExecFileSync
    delete require.cache[ttsPath]
  })
