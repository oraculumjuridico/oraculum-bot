const Module = require("node:module")
const path = require("node:path")

let installed = false
let originalLoad = null

function firewallMode() {
  const configured = String(
    process.env.CONSULTATION_FIREWALL_MODE ||
    process.env.CONSULTA_RUNTIME_ENFORCEMENT_MODE ||
    ""
  ).toLowerCase()
  if (["strict", "warn", "off"].includes(configured)) return configured
  if (process.env.NODE_ENV === "development") return "warn"
  return "strict"
}

function protectedModule(request) {
  const normalized = String(request || "").replaceAll("\\", "/")
  const names = [
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
    "consultation-change-control",
    "consultation-integrity-check",
    "event-versioning",
    "reconcile-consulta"
  ]
  return names.find(name => new RegExp(`(^|/)${name}(?:\\.js)?$`).test(normalized)) || null
}

function isFacade(filename = "") {
  const normalized = filename.replaceAll("\\", "/")
  return normalized.endsWith("/domain/consultation/index.js")
}

function internalAccessAllowed(target, parentFilename = "") {
  const parent = path.basename(parentFilename)
  if (isFacade(parentFilename)) return true
  if (parentFilename.replaceAll("\\", "/").includes("/domain/consultation/")) return true
  if (target === "event-versioning" &&
      ["consultation-events.js", "consultation-read-model.js"].includes(parent)) return true
  if (target === "consultation-read-model" && parent === "consultation-metrics.js") return true
  if (["calendar-scheduling", "consultation-events"].includes(target) &&
      parent === "consultation-read-model.js") return true
  return false
}

function violation(target, parentFilename, mode) {
  const message = `[consultation-firewall] acesso a ${target} bloqueado para ${parentFilename || "<unknown>"}; use src/domain/consultation`
  if (mode === "strict") {
    const error = new Error(message)
    error.code = "CONSULTATION_DEPENDENCY_FIREWALL"
    throw error
  }
  if (mode === "warn") console.warn(message)
}

function installConsultationDependencyFirewall({ mode = firewallMode() } = {}) {
  if (installed || mode === "off") return { installed, mode }
  originalLoad = Module._load
  Module._load = function consultationFirewallLoad(request, parent, isMain) {
    const target = protectedModule(request)
    if (target && !internalAccessAllowed(target, parent?.filename)) {
      violation(target, parent?.filename, mode)
    }
    return originalLoad.apply(this, arguments)
  }
  installed = true
  return { installed: true, mode }
}

module.exports = {
  installConsultationDependencyFirewall,
  protectedModule,
  internalAccessAllowed
}
