"use strict"

/**
 * Diagnóstico de pré-atendimentos com nome "Cliente"
 * 
 * Analisa por que alguns itens aparecem como "Cliente" genérico
 * sem revelar dados pessoais (nomes ou telefones completos)
 */

const fs = require("fs")
const path = require("path")

const DATA_DIR = path.join(__dirname, "..", "data")
const USERS_STATE_FILE = path.join(DATA_DIR, "users-state.json")

function sanitizarTelefone(telefone) {
  if (!telefone || typeof telefone !== "string") return "ausente"
  const limpo = telefone.replace(/\D/g, "")
  if (limpo.length < 4) return "inválido"
  return `***${limpo.slice(-4)}`
}

function classificarNome(nome) {
  if (!nome || typeof nome !== "string") return "ausente"
  const limpo = nome.trim()
  if (!limpo) return "vazio"
  if (limpo.toLowerCase() === "cliente") return "genérico"
  if (/^[0-9+\-\s()]+$/.test(limpo)) return "número"
  if (limpo.length < 2) return "curto"
  if (!/\s/.test(limpo)) return "sem_sobrenome"
  return "válido"
}

function diagnosticarItem(from, u) {
  const telefone = sanitizarTelefone(from)
  
  const diagnostico = {
    telefone,
    temNumeroCaso: Boolean(u.numeroCaso),
    temContatoId: Boolean(u.contatoId),
    temNegocioId: Boolean(u.negocioId),
    nomeConfirmado: Boolean(u.nomeConfirmado),
    consultouHubSpot: Boolean(u._hubspotConsultadoEm),
    hubspotSemContato: Boolean(u._hubspotSemContato),
    campos: {
      nome: classificarNome(u.nome),
      nomeHubspot: classificarNome(u.nomeHubspot),
      nomeWA: classificarNome(u.nomeWA),
      nomePerfilWhatsApp: classificarNome(u.nomePerfilWhatsApp)
    },
    stage: u.stage || "ausente",
    etapa: u.etapa || "ausente"
  }
  
  // Determinar causa principal
  const causas = []
  
  if (!u._hubspotConsultadoEm) {
    causas.push("nunca_consultou_hubspot")
  } else if (u._hubspotSemContato) {
    causas.push("hubspot_sem_contato")
  }
  
  if (diagnostico.campos.nomeHubspot === "ausente" || diagnostico.campos.nomeHubspot === "genérico") {
    if (u._hubspotConsultadoEm) {
      causas.push("hubspot_sem_nome_válido")
    }
  }
  
  if (diagnostico.campos.nomePerfilWhatsApp === "ausente" || 
      diagnostico.campos.nomePerfilWhatsApp === "genérico" ||
      diagnostico.campos.nomePerfilWhatsApp === "número") {
    causas.push("perfil_whatsapp_inválido")
  }
  
  if (diagnostico.campos.nomeWA === "ausente" || 
      diagnostico.campos.nomeWA === "genérico") {
    causas.push("nomeWA_inválido")
  }
  
  if (!u.nomeConfirmado && diagnostico.campos.nome !== "ausente" && diagnostico.campos.nome !== "genérico") {
    causas.push("nome_não_confirmado")
  }
  
  if (causas.length === 0) {
    causas.push("causa_desconhecida")
  }
  
  diagnostico.causasPrincipais = causas
  
  return diagnostico
}

function executarDiagnostico() {
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("DIAGNÓSTICO DE PRÉ-ATENDIMENTOS COM NOME GENÉRICO")
  console.log("═══════════════════════════════════════════════════════════════\n")
  
  if (!fs.existsSync(USERS_STATE_FILE)) {
    console.log("❌ Arquivo users-state.json não encontrado")
    console.log(`   Caminho esperado: ${USERS_STATE_FILE}\n`)
    return
  }
  
  const raw = fs.readFileSync(USERS_STATE_FILE, "utf8")
  const parsed = JSON.parse(raw)
  const users = parsed.users || {}
  
  const itemsComCliente = []
  const estatisticas = {
    total: 0,
    comNumeroCaso: 0,
    preAtendimento: 0,
    causas: {}
  }
  
  for (const [from, u] of Object.entries(users)) {
    estatisticas.total++
    
    if (u.numeroCaso) {
      estatisticas.comNumeroCaso++
      continue // Casos já registrados não são pré-atendimentos
    }
    
    estatisticas.preAtendimento++
    
    // Verificar se apareceria como "Cliente" no Admin
    const temNomeValido = (
      (u.nomeConfirmado && u.nome && u.nome !== "Cliente") ||
      (u.nomeHubspot && u.nomeHubspot !== "Cliente") ||
      (u.nomePerfilWhatsApp && u.nomePerfilWhatsApp !== "Cliente" && !/^[0-9+\-\s()]+$/.test(u.nomePerfilWhatsApp)) ||
      (u.nomeWA && u.nomeWA !== "Cliente" && !/^[0-9+\-\s()]+$/.test(u.nomeWA))
    )
    
    if (!temNomeValido) {
      const diag = diagnosticarItem(from, u)
      itemsComCliente.push(diag)
      
      // Contar causas
      for (const causa of diag.causasPrincipais) {
        estatisticas.causas[causa] = (estatisticas.causas[causa] || 0) + 1
      }
    }
  }
  
  console.log("📊 ESTATÍSTICAS GERAIS\n")
  console.log(`   Total de sessões: ${estatisticas.total}`)
  console.log(`   Com caso registrado: ${estatisticas.comNumeroCaso}`)
  console.log(`   Pré-atendimentos: ${estatisticas.preAtendimento}`)
  console.log(`   Com nome genérico "Cliente": ${itemsComCliente.length}\n`)
  
  if (itemsComCliente.length === 0) {
    console.log("✅ Nenhum pré-atendimento com nome genérico encontrado!\n")
    return
  }
  
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("CAUSAS IDENTIFICADAS\n")
  
  const causasOrdenadas = Object.entries(estatisticas.causas)
    .sort((a, b) => b[1] - a[1])
  
  for (const [causa, contagem] of causasOrdenadas) {
    const percentual = ((contagem / itemsComCliente.length) * 100).toFixed(1)
    console.log(`   ${causa.padEnd(35)} ${String(contagem).padStart(3)} (${percentual}%)`)
  }
  
  console.log("\n═══════════════════════════════════════════════════════════════")
  console.log("ANÁLISE DETALHADA (primeiros 5 itens)\n")
  
  for (let i = 0; i < Math.min(5, itemsComCliente.length); i++) {
    const diag = itemsComCliente[i]
    console.log(`${i + 1}. Telefone: ${diag.telefone}`)
    console.log(`   Stage: ${diag.stage} | Etapa: ${diag.etapa}`)
    console.log(`   Caso: ${diag.temNumeroCaso ? "Sim" : "Não"} | ` +
                `Contato: ${diag.temContatoId ? "Sim" : "Não"} | ` +
                `Negócio: ${diag.temNegocioId ? "Sim" : "Não"}`)
    console.log(`   Consultou HubSpot: ${diag.consultouHubSpot ? "Sim" : "Não"} | ` +
                `Sem contato: ${diag.hubspotSemContato ? "Sim" : "Não"}`)
    console.log(`   Campos:`)
    console.log(`      nome:              ${diag.campos.nome}`)
    console.log(`      nomeHubspot:       ${diag.campos.nomeHubspot}`)
    console.log(`      nomeWA:            ${diag.campos.nomeWA}`)
    console.log(`      nomePerfilWhatsApp: ${diag.campos.nomePerfilWhatsApp}`)
    console.log(`   Causas: ${diag.causasPrincipais.join(", ")}`)
    console.log()
  }
  
  if (itemsComCliente.length > 5) {
    console.log(`   ... e mais ${itemsComCliente.length - 5} itens\n`)
  }
  
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("RECOMENDAÇÕES\n")
  
  const recomendacoes = []
  
  if (estatisticas.causas.nunca_consultou_hubspot) {
    recomendacoes.push(`• ${estatisticas.causas.nunca_consultou_hubspot} item(ns) nunca consultaram HubSpot`)
    recomendacoes.push(`  → Garantir que resolverUsuarioPorHubSpot é chamado no webhook`)
  }
  
  if (estatisticas.causas.perfil_whatsapp_inválido) {
    recomendacoes.push(`• ${estatisticas.causas.perfil_whatsapp_inválido} item(ns) com perfil WhatsApp inválido`)
    recomendacoes.push(`  → Verificar captura de contacts[0].profile.name no webhook`)
  }
  
  if (estatisticas.causas.hubspot_sem_nome_válido) {
    recomendacoes.push(`• ${estatisticas.causas.hubspot_sem_nome_válido} item(ns) com contato HubSpot sem nome`)
    recomendacoes.push(`  → Contatos criados no HubSpot devem ter firstname preenchido`)
  }
  
  if (estatisticas.causas.causa_desconhecida) {
    recomendacoes.push(`• ${estatisticas.causas.causa_desconhecida} item(ns) com causa desconhecida`)
    recomendacoes.push(`  → Revisar lógica de resolverNomeUnificado`)
  }
  
  for (const rec of recomendacoes) {
    console.log(rec)
  }
  
  console.log("\n═══════════════════════════════════════════════════════════════\n")
}

if (require.main === module) {
  try {
    executarDiagnostico()
  } catch (err) {
    console.error("❌ Erro ao executar diagnóstico:", err.message)
    process.exit(1)
  }
}

module.exports = { diagnosticarItem, classificarNome }
