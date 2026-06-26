const axios = require("axios")
const { logErro } = require("../utils/logging")

const { GROQ_KEY } = process.env

let deps = {
  sortearAtendente: () => null
}

function configurarGroqClientReplies(config = {}) {
  deps = { ...deps, ...config }
}

async function respostaIA(u, pergunta) {
  if (!GROQ_KEY) return null
  try {
    const atendente = u.atendente || deps.sortearAtendente()
    u.atendente = atendente
    const sistema = `Você é ${atendente}, atendente da Oráculum Advocacia. Responda dúvidas jurídicas de forma clara e acessível para leigos. Áreas: INSS, Trabalhista, Família, Cível. Nunca prometa resultados. Seja objetiva e empática. Dados do cliente: Área: ${u.area || "não informado"} | Caso: ${u.numeroCaso || "não cadastrado"}.`
    u.historiaIA.push({ role: "user", content: pergunta })
    if (u.historiaIA.length > 10) u.historiaIA = u.historiaIA.slice(-10)
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "llama-3.1-8b-instant", messages: [{ role: "system", content: sistema }, ...u.historiaIA], max_tokens: 400, temperature: 0.7 },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const resposta = res.data.choices[0].message.content
    u.historiaIA.push({ role: "assistant", content: resposta })
    return resposta
  } catch (e) { logErro("groq", e.message); return null }
}

async function respostaIACliente(u, pergunta) {
  if (!GROQ_KEY) return null
  try {
    const sistema = `Você atende clientes cadastrados da Oráculum Advocacia pelo WhatsApp.
Função: orientar o uso do menu do cliente e dúvidas simples sobre andamento do atendimento.
Não dê orientação jurídica específica, não prometa resultado, não invente prazos e não diga que não conhece a Oráculum.
Se a pergunta exigir análise jurídica, encaminhe para "Falar com advogado".
Responda em português brasileiro, de forma curta e clara, com no máximo 3 frases.
Dados disponíveis: número do caso ${u.numeroCaso || "não informado"}; área ${u.area || "não informada"}; situação ${u.situacao || "não informada"}.`
    const historico = Array.isArray(u.historiaIA) ? u.historiaIA.slice(-6) : []
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: sistema },
          ...historico,
          { role: "user", content: pergunta }
        ],
        max_tokens: 220,
        temperature: 0.3
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    return res.data.choices?.[0]?.message?.content?.trim()
      || "Posso te ajudar pelo menu do cliente. Para uma orientação jurídica específica, escolha *Falar com advogado*."
  } catch (e) {
    logErro("groq", "respostaIACliente: " + e.message)
    return "Posso te ajudar pelo menu do cliente. Para uma orientação jurídica específica, escolha *Falar com advogado*."
  }
}

module.exports = {
  configurarGroqClientReplies,
  respostaIA,
  respostaIACliente
}
