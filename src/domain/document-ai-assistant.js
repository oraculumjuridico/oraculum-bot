"use strict"

const axios = require("axios")

const ALLOWED_RECOMMENDATIONS = new Set(["continue", "review", "request_new_image"])

function uniqueStrings(values = [], max = 20) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))].slice(0, max)
}

function construirSinaisDocumentais(pipeline = {}, contexto = {}) {
  const classification = pipeline.classificacao || {}
  const extraction = pipeline.extracao || {}
  const candidates = Array.isArray(classification.candidatos) ? classification.candidatos : []
  return {
    expectedDocumentId: String(contexto.documentoId || "").slice(0, 80),
    expectedDocumentLabel: String(contexto.documentoLabel || "").slice(0, 120),
    requestedPart: String(contexto.folha || "").slice(0, 60),
    selectedVariant: String(pipeline.selectedVariant || "standard").slice(0, 80),
    scanner: {
      applied: Boolean(pipeline.digitalizacao?.applied),
      confidence: Number(pipeline.digitalizacao?.confidence || 0),
      reason: String(pipeline.digitalizacao?.reason || "").slice(0, 80)
    },
    ocr: {
      hasText: Boolean(String(pipeline.ocr?.textoCompleto || "").trim()),
      confidence: Number.isFinite(Number(pipeline.ocr?.confianca)) ? Number(pipeline.ocr.confianca) : null
    },
    classification: {
      type: String(classification.tipoDocumento || "").slice(0, 100),
      category: String(classification.categoria || "").slice(0, 80),
      confidence: Number(classification.confianca || 0),
      candidates: candidates.slice(0, 4).map(item => ({
        type: String(item?.tipoDocumento || "").slice(0, 100),
        confidence: Number(item?.confianca || 0)
      }))
    },
    extractedFieldNames: uniqueStrings(Object.keys(extraction.camposExtraidos || {})),
    qualityWarnings: uniqueStrings([
      ...(pipeline.qualidade?.warnings || []),
      ...(pipeline.qualidade?.originalWarnings || [])
    ]),
    variantConflict: Boolean(pipeline.variantSelection?.conflict),
    deterministicSafe: Boolean(pipeline.variantSelection?.safe)
  }
}

function parseJsonResponse(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const parsed = JSON.parse(text)
  const recommendation = ALLOWED_RECOMMENDATIONS.has(parsed?.recommendation)
    ? parsed.recommendation
    : "review"
  return {
    recommendation,
    reasonCode: String(parsed?.reasonCode || "ai_document_review").replace(/[^a-z0-9_-]/gi, "_").slice(0, 80),
    missingFieldGroups: uniqueStrings(parsed?.missingFieldGroups, 8)
  }
}

async function avaliarDocumentoComIA({ pipeline = {}, contexto = {} } = {}, deps = {}) {
  const env = deps.env || process.env
  const apiKey = String(env.GROQ_KEY || "").trim()
  if (!apiKey) return { used: false, skipped: true, reason: "ai_not_configured" }

  const signals = construirSinaisDocumentais(pipeline, contexto)
  if (signals.deterministicSafe && !signals.variantConflict && !signals.qualityWarnings.length) {
    return { used: false, skipped: true, reason: "deterministic_result_safe" }
  }

  try {
    const client = deps.http || axios
    const response = await client.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: env.GROQ_DOCUMENT_MODEL || "llama-3.1-8b-instant",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Você revisa sinais técnicos sanitizados de documentos jurídicos.",
              "Você NÃO recebe imagem, texto OCR nem valores pessoais.",
              "Nunca invente dados e nunca transforme resultado inseguro em aceito.",
              "Escolha somente continue, review ou request_new_image.",
              "Use request_new_image apenas quando qualidade ou lado solicitado impedirem leitura.",
              "Responda JSON: {recommendation,reasonCode,missingFieldGroups}."
            ].join(" ")
          },
          { role: "user", content: JSON.stringify(signals) }
        ]
      },
      {
        timeout: Math.max(1000, Math.min(6000, Number(env.GROQ_DOCUMENT_TIMEOUT_MS || 4000))),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
      }
    )
    const result = parseJsonResponse(response?.data?.choices?.[0]?.message?.content)
    return { used: true, skipped: false, ...result, signals }
  } catch (error) {
    return { used: false, skipped: true, reason: error?.code || "ai_document_assistance_failed", signals }
  }
}

module.exports = {
  ALLOWED_RECOMMENDATIONS,
  construirSinaisDocumentais,
  parseJsonResponse,
  avaliarDocumentoComIA
}
