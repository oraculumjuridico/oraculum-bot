const axios = require("axios")

require("dotenv").config({ quiet: true })

const TIMEOUT_MS = 15000

function msDesde(inicio) {
  return `${Date.now() - inicio}ms`
}

function erroSemResposta(err) {
  if (err.response) return null
  return err.code || err.message || "sem resposta"
}

async function medir(nome, fn) {
  const inicio = Date.now()
  try {
    const resultado = await fn()
    return { nome, ms: msDesde(inicio), ...resultado }
  } catch (err) {
    const motivo = erroSemResposta(err) || err.message
    return { nome, ms: msDesde(inicio), ok: false, motivo: `sem resposta (${motivo})` }
  }
}

async function testarHubSpot() {
  return medir("HubSpot", async () => {
    const res = await axios.get("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN || ""}` },
      timeout: TIMEOUT_MS,
      validateStatus: () => true
    })

    if ((res.status >= 200 && res.status < 300) || res.status === 404) {
      return { ok: true, motivo: `vivo (status ${res.status})` }
    }
    if (res.status === 401) return { ok: false, motivo: "token inválido" }
    return { ok: false, motivo: `status inesperado ${res.status}` }
  })
}

async function testarGroq() {
  return medir("Groq", async () => {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        max_tokens: 5,
        messages: [{ role: "user", content: "ok" }]
      },
      {
        headers: { Authorization: `Bearer ${process.env.GROQ_KEY || ""}` },
        timeout: TIMEOUT_MS,
        validateStatus: () => true
      }
    )

    if (res.status === 200) return { ok: true, motivo: "vivo" }
    if (res.status === 401) return { ok: false, motivo: "chave inválida" }
    return { ok: false, motivo: `status inesperado ${res.status}` }
  })
}

async function testarGoogleDrive() {
  return medir("Google Drive", async () => {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
      grant_type: "refresh_token"
    })

    const res = await axios.post("https://oauth2.googleapis.com/token", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: TIMEOUT_MS,
      validateStatus: () => true
    })

    if (res.data?.access_token) return { ok: true, motivo: "autenticado" }
    return { ok: false, motivo: "credenciais inválidas ou refresh token expirado" }
  })
}

async function testarAssemblyAI() {
  return medir("AssemblyAI", async () => {
    const res = await axios.get("https://api.assemblyai.com/v2/transcript?limit=1", {
      headers: { Authorization: process.env.ASSEMBLYAI_KEY || "" },
      timeout: TIMEOUT_MS,
      validateStatus: () => true
    })

    if (res.status === 200) return { ok: true, motivo: "chave válida" }
    if (res.status === 401) return { ok: false, motivo: "chave inválida" }
    return { ok: false, motivo: `status inesperado ${res.status}` }
  })
}

async function main() {
  console.log("Smoke test Oráculum Bot\n")

  const testes = [
    testarHubSpot(),
    testarGroq(),
    testarGoogleDrive(),
    testarAssemblyAI()
  ]

  const settled = await Promise.allSettled(testes)
  const resultados = settled.map((item, i) => {
    if (item.status === "fulfilled") return item.value
    const nomes = ["HubSpot", "Groq", "Google Drive", "AssemblyAI"]
    return { nome: nomes[i], ms: "0ms", ok: false, motivo: item.reason?.message || "falha inesperada" }
  })

  for (const r of resultados) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.nome} - ${r.ms} - ${r.motivo}`)
  }

  const falhas = resultados.filter(r => !r.ok)
  console.log("\nResumo")
  if (falhas.length === 0) {
    console.log("✅ Integrações ok. Pode testar no WhatsApp.")
  } else {
    for (const falha of falhas) {
      console.log(`❌ ${falha.nome} fora. Corrija antes de testar.`)
    }
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error(`❌ Smoke test falhou: ${err.message}`)
  process.exitCode = 1
})
