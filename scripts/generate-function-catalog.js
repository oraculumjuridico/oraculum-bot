"use strict"

const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.resolve(__dirname, "..")
const OUTPUT = path.join(ROOT, "docs", "reference", "FUNCTION_CATALOG.md")

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const full = path.join(directory, entry.name)
      return entry.isDirectory() ? walk(full) : [full]
    })
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length
}

function humanize(name) {
  return String(name)
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
}

const PURPOSE_PREFIXES = [
  ["validar", "Valida"], ["verificar", "Verifica"], ["garantir", "Garante"],
  ["normalizar", "Normaliza"], ["sanitizar", "Sanitiza"], ["mascarar", "Mascara"],
  ["criar", "Cria"], ["montar", "Monta"], ["construir", "Constrói"], ["gerar", "Gera"],
  ["buscar", "Busca"], ["obter", "Obtém"], ["listar", "Lista"], ["carregar", "Carrega"],
  ["salvar", "Salva"], ["persistir", "Persiste"], ["restaurar", "Restaura"],
  ["enviar", "Envia"], ["responder", "Responde"], ["processar", "Processa"],
  ["executar", "Executa"], ["aplicar", "Aplica"], ["resolver", "Resolve"],
  ["detectar", "Detecta"], ["classificar", "Classifica"], ["calcular", "Calcula"],
  ["formatar", "Formata"], ["registrar", "Registra"], ["marcar", "Marca"],
  ["iniciar", "Inicia"], ["encerrar", "Encerra"], ["agendar", "Agenda"],
  ["cancelar", "Cancela"], ["atualizar", "Atualiza"], ["remover", "Remove"],
  ["converter", "Converte"], ["dividir", "Divide"], ["unir", "Une"],
  ["eh", "Determina se"], ["is", "Determina se"], ["has", "Determina se existe"]
]

function purpose(name) {
  const lower = name.toLowerCase()
  for (const [prefix, verb] of PURPOSE_PREFIXES) {
    if (!lower.startsWith(prefix)) continue
    const rest = name.slice(prefix.length)
    return `${verb} ${humanize(rest || name)}.`
  }
  return `Executa a responsabilidade interna “${humanize(name)}”.`
}

function moduleRole(relative) {
  const normalized = relative.replace(/\\/g, "/")
  const base = path.basename(normalized, ".js").replace(/[._-]+/g, " ")
  if (normalized === "server.js") return "Composição principal, rotas HTTP e orquestração dos fluxos WhatsApp."
  if (normalized === "tts.js") return "Síntese de voz, normalização de fala e fallback de áudio."
  if (normalized.includes("/adapters/")) return `Adaptador de integração: ${base}.`
  if (normalized.includes("/composition/")) return `Composição de dependências: ${base}.`
  if (normalized.includes("/config/")) return `Configuração e diagnóstico: ${base}.`
  if (normalized.includes("/infrastructure/")) return `Infraestrutura e persistência: ${base}.`
  if (normalized.includes("/scripts/")) return `Ferramenta operacional controlada: ${base}.`
  if (normalized.includes("/domain/")) return `Regra de domínio: ${base}.`
  if (normalized.includes("/utils/")) return `Utilitário compartilhado: ${base}.`
  return `Módulo do runtime: ${base}.`
}

function functionsFrom(file) {
  const source = fs.readFileSync(file, "utf8")
  const exportedSource = source.slice(Math.max(0, source.lastIndexOf("module.exports")))
  const found = new Map()
  const patterns = [
    /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^\n]*?\)|[A-Za-z_$][\w$]*)\s*=>/gm
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (!found.has(match[1])) {
        found.set(match[1], {
          name: match[1],
          line: lineNumber(source, match.index),
          visibility: new RegExp(`\\b${match[1]}\\b`).test(exportedSource) ? "pública" : "interna"
        })
      }
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line)
}

function main() {
  const files = [
    path.join(ROOT, "server.js"),
    path.join(ROOT, "tts.js"),
    ...walk(path.join(ROOT, "src")).filter(file => file.endsWith(".js"))
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))

  const modules = files.map(file => ({
    relative: path.relative(ROOT, file).replace(/\\/g, "/"),
    functions: functionsFrom(file)
  })).filter(item => item.functions.length)
  const total = modules.reduce((sum, item) => sum + item.functions.length, 0)

  const lines = [
    "# Catálogo de funções do runtime",
    "",
    "> Arquivo gerado por `npm run docs:catalog`. Não editar manualmente.",
    "",
    "Este índice cobre as funções nomeadas de `server.js`, `tts.js` e `src/`. A explicação conceitual dos fluxos está em `docs/ORACULUM_SYSTEM_GUIDE.md`.",
    "",
    `Total: **${total} funções** em **${modules.length} módulos**.`,
    "",
    "- **pública**: aparece no contrato `module.exports` do módulo;",
    "- **interna**: detalhe de implementação usado dentro do próprio módulo.",
    ""
  ]

  for (const item of modules) {
    lines.push(`## \`${item.relative}\``, "", moduleRole(item.relative), "", "| Função | Linha | Visibilidade | Responsabilidade |", "| --- | ---: | --- | --- |")
    for (const fn of item.functions) {
      lines.push(`| \`${fn.name}\` | ${fn.line} | ${fn.visibility} | ${purpose(fn.name)} |`)
    }
    lines.push("")
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, `${lines.join("\n").trimEnd()}\n`, "utf8")
  console.log(`FUNCTION_CATALOG modules=${modules.length} functions=${total}`)
}

if (require.main === module) main()

module.exports = { functionsFrom, purpose, moduleRole, main }
