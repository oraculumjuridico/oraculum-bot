const crypto = require("crypto")
const {
  hsAtualizarContato,
  hsAtualizarNegocio
} = require("./hubspot-core")
const {
  CONTACT_WRITE_PROPERTIES,
  DEAL_WRITE_PROPERTIES
} = require("./hubspot-contract")
const { sanitizarTextoEntrada } = require("../utils/text")

const DOCUMENT_HUBSPOT_SYNC_VERSION = "document-hubspot-sync-v1"
const DEFAULT_MIN_CONFIDENCE = 0.85

const BLOCKED_FIELDS = new Set([
  "rg",
  "numero_rg",
  "orgao_emissor",
  "orgao_emissor_rg",
  "data_emissao_rg",
  "crm",
  "cid",
  "exames",
  "laudos",
  "cnis",
  "documentos",
  "pdfs",
  "ocr",
  "texto_ocr",
  "texto_completo",
  "historico_documental",
  "divergencias"
])

const CONTACT_FIELD_MAP = {
  nome: "firstname",
  nome_completo: "firstname",
  cpf: "cpf_do_cliente",
  data_nascimento: "date_of_birth",
  data_de_nascimento: "date_of_birth",
  nascimento: "date_of_birth",
  telefone: "phone",
  whatsapp: "phone",
  email: "email",
  cidade: "city",
  uf: "state",
  estado: "state"
}

const CONTACT_VALIDATION_FIELDS = {
  phone: ["telefone_validado", "telefonevalidado", "whatsapp_validado", "whatsappvalidado", "phone_validated"],
  email: ["email_validado", "emailvalidado", "email_validated"]
}

const DEAL_FIELD_MAP = {
  area_juridica: "area_juridica",
  area: "area_juridica",
  tipo_caso: "tipo_de_caso",
  tipo_de_caso: "tipo_de_caso",
  urgencia: "urgencia",
  prioridade: "hs_priority",
  pasta_drive: "pasta_drive",
  link_pasta_drive: "pasta_drive",
  // Map process-related extracted fields to numero_de_caso (use consolidated canonical if available)
  numero_processo: "numero_de_caso",
  numero_de_processo: "numero_de_caso",
  processo: "numero_de_caso"
}

function nowISO(options = {}) {
  return options.now || new Date().toISOString()
}

function normalizarTexto(valor = "") {
  return sanitizarTextoEntrada(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function valorVazio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === ""
}

function obterProperties(registro = {}) {
  return registro?.properties || registro || {}
}

function obterId(registro = {}, aliases = []) {
  for (const alias of aliases) {
    if (!valorVazio(registro?.[alias])) return String(registro[alias])
  }
  if (!valorVazio(registro?.id)) return String(registro.id)
  return null
}

function normalizarConfiancas(confiancas = {}) {
  return Object.fromEntries(
    Object.entries(confiancas || {}).map(([campo, confianca]) => [
      normalizarTexto(campo),
      Number(confianca)
    ])
  )
}

function confiancaCampo(campoNormalizado, versao = {}) {
  const confiancas = normalizarConfiancas(versao.extracao?.confiancaPorCampo)
  if (Number.isFinite(confiancas[campoNormalizado])) return confiancas[campoNormalizado]
  const classificacao = Number(versao.classificacao?.confianca)
  return Number.isFinite(classificacao) ? classificacao : 0
}

function iterarCamposExtraidos(registry = {}) {
  const candidatos = []
  for (const documento of normalizarArray(registry.documentos)) {
    if (documento.status === "erro" || documento.vigente === false) continue
    const versao = normalizarArray(documento.versoes).at(-1) || documento
    const campos = versao.extracao?.camposExtraidos || {}
    for (const [campoOriginal, valor] of Object.entries(campos)) {
      const campo = normalizarTexto(campoOriginal)
      if (!campo || BLOCKED_FIELDS.has(campo) || valorVazio(valor)) continue
      candidatos.push({
        campoOriginal,
        campo,
        valor,
        origem: {
          registryId: documento.registryId || documento.chaveDocumento || null,
          fileId: documento.fileId || null,
          tipoDocumento: documento.tipoDocumento || versao.tipoDocumento || null,
          campo: campoOriginal
        },
        confianca: confiancaCampo(campo, versao),
        documento
      })
    }
  }
  return candidatos
}

function campoTemValidacao(candidato = {}, hubspotField) {
  const validadores = CONTACT_VALIDATION_FIELDS[hubspotField]
  if (!validadores) return true

  const campos = candidato.documento?.versoes?.at(-1)?.extracao?.camposExtraidos || {}
  const normalizados = Object.fromEntries(
    Object.entries(campos).map(([campo, valor]) => [normalizarTexto(campo), valor])
  )
  return validadores.some(campo => normalizados[campo] === true || String(normalizados[campo]).toLowerCase() === "true")
}

function normalizarValorHubSpot(field, valor) {
  const texto = sanitizarTextoEntrada(valor)
  if (!texto) return ""
  if (field === "hs_priority") {
    const normalizado = normalizarTexto(texto)
    if (["alta", "high"].includes(normalizado)) return "high"
    if (["media", "medio", "moderada", "medium"].includes(normalizado)) return "medium"
    if (["baixa", "low"].includes(normalizado)) return "low"
    return texto
  }
  if (field === "urgencia") {
    const normalizado = normalizarTexto(texto)
    if (["alta", "high"].includes(normalizado)) return "Alta"
    if (["baixa", "low"].includes(normalizado)) return "Baixa"
    if (["media", "medio", "moderada", "normal", "medium"].includes(normalizado)) return "Moderada"
    return texto
  }
  return texto
}

function camposValidadosManualmente(registro = {}) {
  const props = obterProperties(registro)
  return new Set([
    ...normalizarArray(registro.camposValidadosManualmente),
    ...normalizarArray(registro.propertiesValidadasManualmente),
    ...normalizarArray(props.campos_validados_manualmente),
    ...normalizarArray(props.properties_validadas_manualmente)
  ].map(normalizarTexto))
}

function campoManual(registro = {}, field) {
  const props = obterProperties(registro)
  const manual = camposValidadosManualmente(registro)
  return manual.has(normalizarTexto(field)) ||
    props[`${field}_validado_manualmente`] === true ||
    props[`${field}_manual`] === true
}

function podeAtualizarCampo({ registro, field, valorNovo, confianca, minConfidence, force = false }) {
  const props = obterProperties(registro)
  const valorAnterior = props[field]

  if (valorVazio(valorNovo)) return false
  if (campoManual(registro, field)) return false
  if (String(valorAnterior || "").trim() === String(valorNovo || "").trim()) return false
  if (valorVazio(valorAnterior)) return true
  if (force) return true
  return Number(confianca) >= minConfidence
}

function assinaturaAtualizacao(tipoObjeto, objectId, props = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ tipoObjeto, objectId, props: ordenarObjeto(props) }))
    .digest("hex")
}

function ordenarObjeto(objeto = {}) {
  return Object.fromEntries(Object.entries(objeto).sort(([a], [b]) => a.localeCompare(b)))
}

function obterAssinaturas(registry = {}) {
  return new Set(normalizarArray(registry.metadados?.hubspotDocumentSync?.assinaturas))
}

function montarResumoDocumental(registry = {}) {
  const estatisticas = registry.estatisticas || {}
  const total = Number(estatisticas.totalDocumentos || normalizarArray(registry.documentos).length || 0)
  const pendencias = Number(estatisticas.totalPendencias || normalizarArray(registry.pendencias).length || 0)
  const divergencias = Number(estatisticas.totalDivergencias || normalizarArray(registry.divergencias).length || 0)
  if (!total && !pendencias && !divergencias) return ""
  return `Documentos recebidos: ${total}. Pendencias: ${pendencias}. Divergencias: ${divergencias}.`
}

function candidatosContato(registry = {}) {
  return iterarCamposExtraidos(registry)
    .map(candidato => ({
      ...candidato,
      hubspotField: CONTACT_FIELD_MAP[candidato.campo]
    }))
    .filter(candidato =>
      candidato.hubspotField &&
      CONTACT_WRITE_PROPERTIES.has(candidato.hubspotField) &&
      campoTemValidacao(candidato, candidato.hubspotField)
    )
}

function candidatosNegocio(registry = {}) {
  const candidatos = iterarCamposExtraidos(registry)
    .map(candidato => ({
      ...candidato,
      hubspotField: DEAL_FIELD_MAP[candidato.campo]
    }))
    .filter(candidato => candidato.hubspotField && DEAL_WRITE_PROPERTIES.has(candidato.hubspotField))

  const metadados = registry.metadados || {}
  for (const [campo, hubspotField] of Object.entries(DEAL_FIELD_MAP)) {
    const valor = metadados[campo] || metadados[hubspotField]
    if (!valorVazio(valor) && DEAL_WRITE_PROPERTIES.has(hubspotField)) {
      candidatos.push({
        campoOriginal: campo,
        campo,
        valor,
        hubspotField,
        origem: { metadados: true, campo },
        confianca: 1
      })
    }
  }

  const resumo = metadados.resumoDocumental || montarResumoDocumental(registry)
  if (!valorVazio(resumo)) {
    candidatos.push({
      campoOriginal: "resumo_documental",
      campo: "resumo_documental",
      valor: resumo,
      hubspotField: "resumo_cliente",
      origem: { registry: true, campo: "resumo_documental" },
      confianca: 1
    })
  }

  return candidatos
}

function montarPlanoObjeto({ tipoObjeto, registro, candidatos, minConfidence, assinaturas }) {
  const props = {}
  const auditoria = []
  const bloqueados = []
  const objectId = obterId(registro, tipoObjeto === "contacts" ? ["contactId", "contatoId"] : ["dealId", "negocioId"])

  for (const candidato of candidatos) {
    const field = candidato.hubspotField
    const valorNovo = normalizarValorHubSpot(field, candidato.valor)
    const valorAnterior = obterProperties(registro)[field] || ""

    if (!podeAtualizarCampo({
      registro,
      field,
      valorNovo,
      confianca: candidato.confianca,
      minConfidence
    })) {
      bloqueados.push({
        campo: field,
        origemDocumental: candidato.origem,
        confianca: candidato.confianca,
        motivo: campoManual(registro, field) ? "manual_validado" : "regra_atualizacao"
      })
      continue
    }

    props[field] = valorNovo
    auditoria.push({
      objeto: tipoObjeto,
      campo: field,
      valorAnterior,
      valorNovo,
      origemDocumental: candidato.origem,
      confianca: candidato.confianca
    })
  }

  const propsOrdenadas = ordenarObjeto(props)
  const assinatura = objectId && Object.keys(propsOrdenadas).length
    ? assinaturaAtualizacao(tipoObjeto, objectId, propsOrdenadas)
    : null
  const idempotente = assinatura ? assinaturas.has(assinatura) : false

  return {
    tipoObjeto,
    objectId,
    props: idempotente ? {} : propsOrdenadas,
    auditoria: idempotente ? [] : auditoria,
    bloqueados,
    assinatura,
    idempotente
  }
}

function planejarSincronizacaoDocumentalHubSpot(input = {}, options = {}) {
  const registry = input.registry || input.documentRegistry || input
  const contato = input.contato || input.contact || {}
  const negocio = input.negocio || input.deal || {}
  const minConfidence = Number(options.minConfidence || DEFAULT_MIN_CONFIDENCE)
  const assinaturas = obterAssinaturas(registry)

  const contatoPlano = montarPlanoObjeto({
    tipoObjeto: "contacts",
    registro: contato,
    candidatos: candidatosContato(registry),
    minConfidence,
    assinaturas
  })
  const negocioPlano = montarPlanoObjeto({
    tipoObjeto: "deals",
    registro: negocio,
    candidatos: candidatosNegocio(registry),
    minConfidence,
    assinaturas
  })

  // Integrate consolidation information if provided by the pipeline
  // Use only consolidatedCase explicitly provided by the producer. Planner must not rerun the full
  // document pipeline silently; the producer of the registry must attach consolidatedCase when available.
  const consolidated = registry?.consolidatedCase || null

  if (consolidated) {
    // A. Block CPF when consolidation indicates multiple valid CPFs
    if (Array.isArray(consolidated.conflicts) && consolidated.conflicts.includes('multiple_valid_cpfs')) {
      if (contatoPlano.props && contatoPlano.props.cpf_do_cliente) {
        contatoPlano.bloqueados.push({
          campo: 'cpf_do_cliente',
          origemDocumental: { consolidated: true },
          confianca: 0,
          motivo: 'consolidation_conflict'
        })
        delete contatoPlano.props.cpf_do_cliente
      }
    }

    // B. Map a single consolidated process number to numero_de_caso when available
    const proc = consolidated.canonicalSuggestions && consolidated.canonicalSuggestions.numero_de_caso
    if (proc) {
      const field = 'numero_de_caso'
      const valorNormalizado = normalizarValorHubSpot(field, proc)
      if (podeAtualizarCampo({ registro: negocio, field, valorNovo: valorNormalizado, confianca: 1, minConfidence })) {
        negocioPlano.props = negocioPlano.props || {}
        if (!negocioPlano.props[field]) {
          negocioPlano.props[field] = valorNormalizado
          negocioPlano.auditoria.push({ objeto: 'deals', campo: field, valorAnterior: obterProperties(negocio)[field] || '', valorNovo: valorNormalizado, origemDocumental: { consolidated: true }, confianca: 1 })
        }
      } else {
        negocioPlano.bloqueados.push({ campo: field, origemDocumental: { consolidated: true }, confianca: 1, motivo: 'regra_atualizacao' })
      }
    }
  }

  return {
    versao: DOCUMENT_HUBSPOT_SYNC_VERSION,
    contato: contatoPlano,
    negocio: negocioPlano,
    auditoria: [...contatoPlano.auditoria, ...negocioPlano.auditoria],
    bloqueados: [...contatoPlano.bloqueados, ...negocioPlano.bloqueados]
  }
}

function registrarAssinaturas(registry = {}, assinaturas = [], options = {}) {
  const existentes = obterAssinaturas(registry)
  for (const assinatura of assinaturas.filter(Boolean)) existentes.add(assinatura)
  return {
    ...registry,
    metadados: {
      ...(registry.metadados || {}),
      hubspotDocumentSync: {
        versao: DOCUMENT_HUBSPOT_SYNC_VERSION,
        atualizadoEm: nowISO(options),
        assinaturas: [...existentes]
      }
    }
  }
}

async function sincronizarDocumentosHubSpot(input = {}, deps = {}, options = {}) {
  const registry = input.registry || input.documentRegistry || input
  const plano = planejarSincronizacaoDocumentalHubSpot(input, options)
  const atualizarContato = deps.hsAtualizarContato || hsAtualizarContato
  const atualizarNegocio = deps.hsAtualizarNegocio || hsAtualizarNegocio
  const assinaturasAplicadas = []

  if (plano.contato.objectId && Object.keys(plano.contato.props).length) {
    const atualizado = await atualizarContato(plano.contato.objectId, plano.contato.props)
    if (atualizado) assinaturasAplicadas.push(plano.contato.assinatura)
  }

  if (plano.negocio.objectId && Object.keys(plano.negocio.props).length) {
    const atualizado = await atualizarNegocio(plano.negocio.objectId, plano.negocio.props)
    if (atualizado) assinaturasAplicadas.push(plano.negocio.assinatura)
  }

  return {
    ok: true,
    plano,
    auditoria: plano.auditoria.filter(item =>
      assinaturasAplicadas.includes(plano.contato.assinatura) && item.objeto === "contacts" ||
      assinaturasAplicadas.includes(plano.negocio.assinatura) && item.objeto === "deals"
    ),
    registry: registrarAssinaturas(registry, assinaturasAplicadas, options)
  }
}

module.exports = {
  DOCUMENT_HUBSPOT_SYNC_VERSION,
  BLOCKED_FIELDS,
  planejarSincronizacaoDocumentalHubSpot,
  sincronizarDocumentosHubSpot,
  assinaturaAtualizacao
}
