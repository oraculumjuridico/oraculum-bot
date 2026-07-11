#!/usr/bin/env node
"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")

const option = name => {
  const prefix = `--${name}=`
  const value = process.argv.find(argument => argument.startsWith(prefix))
  return value ? value.slice(prefix.length) : null
}

function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const split = line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(value => value.replace(/^"|"$/g, "").replace(/""/g, '"').trim())
  const headers = split(lines[0]).map(value => value.toLowerCase())
  return lines.slice(1).map(line => Object.fromEntries(split(line).map((value, index) => [headers[index] || `campo_${index + 1}`, value])))
}

function extrairCaso(texto, titulo = "") {
  const original = String(texto || "").trim()
  const telefone = (original.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]*\d{4}/) || [""])[0]
  const numeroCaso = (original.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/) || [""])[0]
  const tipo = (original.match(/\b(previdenci[aá]rio|inss|trabalhista|consumidor|fam[ií]lia|civil)\b/i) || [""])[0]
  const pendencias = original.split(/\r?\n/).filter(line => /pendente|falta|aguardando|providenciar/i.test(line))
  const encontrados = [titulo, telefone, numeroCaso, tipo].filter(Boolean).length
  return {
    id: crypto.createHash("sha256").update(`${titulo}|${original}`).digest("hex").slice(0, 20),
    titulo: titulo || original.split(/\r?\n/)[0] || "Caso sem titulo",
    notas: original,
    telefone: telefone.replace(/\D/g, ""),
    numeroCaso,
    tipo,
    pendencias,
    textoOriginal: original,
    confianca: Number((encontrados / 4).toFixed(2)),
    camposIncertos: [!telefone && "telefone", !numeroCaso && "numeroCaso", !tipo && "tipo"].filter(Boolean)
  }
}

async function lerPdf(file) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const data = new Uint8Array(await fs.readFile(file))
  const document = await getDocument({ data, disableWorker: true }).promise
  const pages = []
  try {
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      pages.push(content.items.map(item => item.str).join(" "))
      page.cleanup()
    }
  } finally { await document.destroy() }
  return pages.join("\n")
}

async function importarArquivo(file) {
  const extension = path.extname(file).toLowerCase()
  if (extension === ".json") {
    const value = JSON.parse(await fs.readFile(file, "utf8"))
    const items = Array.isArray(value) ? value : value.tasks || value.items || [value]
    return items.map(item => extrairCaso(item.notas || item.notes || item.texto || item.body || JSON.stringify(item), item.titulo || item.title || item.subject || ""))
  }
  if (extension === ".csv") {
    return parseCsv(await fs.readFile(file, "utf8")).map(item => extrairCaso(item.notas || item.notes || item.texto || Object.values(item).join("\n"), item.titulo || item.title || item.subject || ""))
  }
  const text = extension === ".pdf" ? await lerPdf(file) : await fs.readFile(file, "utf8")
  return text.split(/(?:\r?\n){2,}/).filter(block => block.trim()).map(block => extrairCaso(block))
}

async function main() {
  const input = option("input")
  if (!input) throw new Error("use --input=arquivo")
  const source = path.resolve(input)
  const output = path.resolve(option("output") || "data/case-import/todo")
  const casos = await importarArquivo(source)
  await fs.mkdir(output, { recursive: true })
  const intermediate = { version: 1, sourceHash: crypto.createHash("sha256").update(await fs.readFile(source)).digest("hex"), generatedAt: new Date().toISOString(), casos }
  const report = {
    version: 1, generatedAt: intermediate.generatedAt, total: casos.length,
    altaConfianca: casos.filter(item => item.confianca >= 0.75).length,
    revisaoManual: casos.filter(item => item.camposIncertos.length).length,
    camposAusentes: Object.fromEntries(["telefone", "numeroCaso", "tipo"].map(campo => [campo, casos.filter(item => item.camposIncertos.includes(campo)).length]))
  }
  await fs.writeFile(path.join(output, "todo-cases-intermediate.json"), JSON.stringify(intermediate, null, 2), { mode: 0o600 })
  await fs.writeFile(path.join(output, "todo-cases-report.json"), JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ ok: true, ...report }))
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1 })
module.exports = { parseCsv, extrairCaso, importarArquivo }
