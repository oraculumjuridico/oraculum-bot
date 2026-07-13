const fs = require("node:fs")
const path = require("node:path")

function normalizar(caminho) {
  return caminho.replaceAll("\\", "/")
}

function listarJs(alvo) {
  if (!fs.existsSync(alvo)) return []
  const stat = fs.statSync(alvo)
  if (stat.isFile()) return alvo.endsWith(".js") ? [alvo] : []
  return fs.readdirSync(alvo, { withFileTypes: true }).flatMap(item => {
    if (["node_modules", ".git", "test"].includes(item.name)) return []
    return listarJs(path.join(alvo, item.name))
  })
}

function nomeModulo(requisicao) {
  for (const nome of [
    "calendar-scheduling",
    "consultation-events",
    "consultation-read-model",
    "consultation-metrics",
    "consultation-replay-engine",
    "consultation-decision-audit",
    "consultation-legal-snapshot",
    "consultation-legal-dossier-builder",
    "consultation-narrative-generator",
    "consultation-audit-verifier",
    "consultation-session-recovery",
    "consultation-integrity-event-store",
    "consultation-self-healed-event",
    "consultation"
  ]) {
    if (requisicao.endsWith(nome) || requisicao.endsWith(`${nome}.js`)) return nome
  }
  return null
}

function acessoInternoPermitido(arquivo, modulo) {
  if (arquivo.startsWith("src/domain/consultation/")) return true
  if (arquivo === "src/domain/consultation/index.js" &&
      ["consultation-read-model", "consultation-metrics"].includes(modulo)) return true
  if (arquivo === "src/domain/consultation-read-model.js" &&
      ["calendar-scheduling", "consultation-events"].includes(modulo)) return true
  return arquivo === "src/domain/consultation-metrics.js" && modulo === "consultation-read-model"
}

function moduloInternoProtegido(modulo) {
  return [
    "calendar-scheduling",
    "consultation-events",
    "consultation-read-model",
    "consultation-metrics",
    "consultation-replay-engine",
    "consultation-decision-audit",
    "consultation-legal-snapshot"
    ,"consultation-legal-dossier-builder"
    ,"consultation-narrative-generator"
    ,"consultation-audit-verifier"
    ,"consultation-session-recovery"
    ,"consultation-integrity-event-store"
    ,"consultation-self-healed-event"
  ].includes(modulo)
}

function extrairImports(conteudo) {
  const imports = []
  for (const match of conteudo.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(["']([^"']+)["']\)/g)) {
    const simbolos = match[1].split(",").map(item => item.trim().split(/\s+as\s+|:/)[0].trim()).filter(Boolean)
    imports.push({ requisicao: match[2], simbolos, namespace: false, index: match.index })
  }
  for (const match of conteudo.matchAll(/(?:const|let|var)\s+[\w$]+\s*=\s*require\(["']([^"']+)["']\)/g)) {
    imports.push({ requisicao: match[1], simbolos: ["*"], namespace: true, index: match.index })
  }
  for (const match of conteudo.matchAll(/require\(["']([^"']+)["']\)\.([\w$]+)/g)) {
    imports.push({ requisicao: match[1], simbolos: [match[2]], namespace: false, index: match.index })
  }
  for (const match of conteudo.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const simbolos = match[1].split(",").map(item => item.trim().split(/\s+as\s+/)[0]).filter(Boolean)
    imports.push({ requisicao: match[2], simbolos, namespace: false, index: match.index })
  }
  for (const match of conteudo.matchAll(/import\s+(?:\*\s+as\s+[\w$]+\s+from\s+|[\w$]+\s+from\s*)["']([^"']+)["']/g)) {
    imports.push({ requisicao: match[1], simbolos: ["*"], namespace: true, index: match.index })
  }
  for (const match of conteudo.matchAll(/(?:module\.exports\s*=\s*|export\s+\*\s+from\s*)require?\s*\(?["']([^"']+)["']\)?/g)) {
    imports.push({ requisicao: match[1], simbolos: ["*"], namespace: true, barrel: true, index: match.index })
  }
  for (const match of conteudo.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
    imports.push({ requisicao: match[1], simbolos: ["*"], namespace: true, barrel: true, index: match.index })
  }
  return imports
}

function resolverLocal(arquivo, requisicao, raiz) {
  if (!requisicao.startsWith(".")) return null
  const base = path.resolve(path.dirname(arquivo), requisicao)
  for (const candidato of [base, `${base}.js`, path.join(base, "index.js")]) {
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) {
      return normalizar(path.relative(raiz, candidato))
    }
  }
  return null
}

function auditArchitecture({ root, baselinePath, mode = "strict" }) {
  const raiz = path.resolve(root)
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  const excluidos = new Set((baseline.scan?.exclude || []).map(normalizar))
  const arquivos = [...new Set((baseline.scan?.include || []).flatMap(item => listarJs(path.join(raiz, item))))]
  const violacoes = []
  const avisar = (arquivo, regra, detalhe, linha = null) =>
    violacoes.push({ arquivo, linha, regra, detalhe })

  const fontes = new Map()
  const grafo = new Map()
  const contaminados = new Set()
  for (const absoluto of arquivos) {
    const arquivo = normalizar(path.relative(raiz, absoluto))
    const conteudo = fs.readFileSync(absoluto, "utf8")
    const imports = extrairImports(conteudo)
    fontes.set(arquivo, { absoluto, conteudo, imports })
    grafo.set(arquivo, imports.map(item => resolverLocal(absoluto, item.requisicao, raiz)).filter(Boolean))
  }

  for (const [arquivo, fonte] of fontes) {
    for (const item of fonte.imports) {
      const modulo = nomeModulo(item.requisicao)
      if (moduloInternoProtegido(modulo) && !acessoInternoPermitido(arquivo, modulo)) {
        contaminados.add(arquivo)
      }
    }
  }
  let mudou
  do {
    mudou = false
    for (const [arquivo, dependencias] of grafo) {
      if (arquivo === "src/domain/consultation/index.js" || contaminados.has(arquivo)) continue
      if (dependencias.some(dependencia => contaminados.has(dependencia))) {
        contaminados.add(arquivo)
        mudou = true
      }
    }
  } while (mudou)

  for (const [arquivo, fonte] of fontes) {
    if (excluidos.has(arquivo)) continue
    const { conteudo, imports } = fonte
    const permitidoArquivo = baseline.allowedDependencies?.[arquivo] || {}

    for (const item of imports) {
      const modulo = nomeModulo(item.requisicao)
      if (!modulo) continue
      const permitidos = permitidoArquivo[modulo]
      const linha = conteudo.slice(0, item.index).split(/\r?\n/).length
      if (!permitidos) {
        avisar(arquivo, "dependencia_nao_registrada", modulo, linha)
      }
      for (const simbolo of item.simbolos) {
        if (permitidos && !permitidos.includes(simbolo)) {
          avisar(arquivo, "importacao_nao_permitida", `${modulo}.${simbolo}`, linha)
        }
        if (modulo === "consultation" &&
            !(baseline.officialDomainEntries || []).includes(simbolo)) {
          avisar(arquivo, "entrada_dominio_nao_oficial", simbolo, linha)
        }
        if (
          !acessoInternoPermitido(arquivo, modulo) &&
          baseline.protectedModules?.[modulo]?.readApis?.includes(simbolo)
        ) {
          avisar(arquivo, "bypass_read_model", `${modulo}.${simbolo}`, linha)
        }
      }
      if (moduloInternoProtegido(modulo) && !acessoInternoPermitido(arquivo, modulo)) {
        avisar(arquivo, item.barrel ? "barrel_bypass" : "hard_lock_import", modulo, linha)
      }
    }

    conteudo.split(/\r?\n/).forEach((linhaTexto, index) => {
      const caminhoFerramentaControlada = "scripts/calendar-controlled-test.js"
      const acessoControlado = baseline.controlledCalendarDirectAccess?.[arquivo]
      const metodosPermitidos = Array.isArray(acessoControlado?.methods) ? acessoControlado.methods : []
      for (const match of linhaTexto.matchAll(/\.(calendarList|events|freebusy)\.(get|list|insert|delete|patch|update|query)\s*\(/g)) {
        const metodo = `${match[1]}.${match[2]}`
        const metodoHistoricamenteProtegido = ["events.get", "events.list"].includes(metodo)
        const deveAuditar = arquivo === caminhoFerramentaControlada || metodoHistoricamenteProtegido
        if (arquivo !== "src/domain/calendar-scheduling.js" && deveAuditar && !metodosPermitidos.includes(metodo)) {
          avisar(arquivo, "calendar_direto", `${metodo}: ${linhaTexto.trim()}`, index + 1)
        }
      }
      if (/require\s*\(\s*[^"'`\s][^)]*\)/.test(linhaTexto) ||
          /require\s*\(\s*[`"'][^`"']*\$\{/.test(linhaTexto)) {
        avisar(arquivo, "require_dinamico", linhaTexto.trim(), index + 1)
      }
    })

    if (contaminados.has(arquivo) &&
        !imports.some(item => moduloInternoProtegido(nomeModulo(item.requisicao)))) {
      avisar(arquivo, "import_indireto_protegido", "dependencia transitiva fora do Read Model")
    }

    if (arquivo === "server.js") {
      for (const match of conteudo.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*["']([^"']+)["']/g)) {
        const rota = match[1]
        if (/(consulta|agendamento|reuniao|lembrete|evento-cancelado)/i.test(rota) &&
            !(baseline.registeredConsultationRoutes || []).includes(rota)) {
          avisar(arquivo, "rota_consulta_nao_registrada", rota, conteudo.slice(0, match.index).split(/\r?\n/).length)
        }
      }
    }
  }

  const resultado = {
    status: violacoes.length ? (mode === "warn" ? "warning" : "failed") : "ok",
    mode,
    baselineVersion: baseline.version,
    arquivosVerificados: arquivos.length,
    violacoes
  }
  return resultado
}

function argumentos(argv) {
  const pegar = (nome, padrao) => {
    const indice = argv.indexOf(nome)
    return indice >= 0 ? argv[indice + 1] : padrao
  }
  const root = path.resolve(pegar("--root", path.join(__dirname, "..", "..")))
  return {
    root,
    baselinePath: path.resolve(pegar("--baseline", path.join(root, "consultation-architecture-baseline.json"))),
    mode: pegar(
      "--mode",
      process.env.CONSULTA_ARCHITECTURE_AUDIT_MODE ||
        (process.env.NODE_ENV === "development" ? "warn" : "strict")
    )
  }
}

if (require.main === module) {
  const resultado = auditArchitecture(argumentos(process.argv.slice(2)))
  const imprimir = resultado.status === "ok" ? console.log : resultado.status === "warning" ? console.warn : console.error
  imprimir(JSON.stringify({ evento: "consulta_architecture_audit", ...resultado }, null, 2))
  if (resultado.status === "failed") process.exitCode = 1
}

module.exports = { auditArchitecture, extrairImports }
