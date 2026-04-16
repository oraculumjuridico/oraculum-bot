// ================================================================
//  ORACULUM ADVOCACIA â€” v6.2.1
//  WhatsApp Â· HubSpot Â· Google Drive Â· AssemblyAI Â· Groq AI
// ================================================================
require("dotenv").config()

const express    = require("express")
const axios      = require("axios")
const { google } = require("googleapis")

const app = express()
app.use(express.json())

const {
  VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID,
  HUBSPOT_TOKEN,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
  DRIVE_PASTA_CLIENTES_ID,
  ASSEMBLYAI_KEY, GROQ_KEY
} = process.env

const MEETINGS = "https://meetings.hubspot.com/oraculum"

const HS_PIPELINE = "default"
const HS_STAGE = {
  lead: "appointmentscheduled", agendamento: "qualifiedtobuy",
  triagem: "presentationscheduled", docs: "decisionmakerboughtin",
  protocolo: "contractsent", andamento: "closedwon",
  finalizado: "closedlost", desistiu: "1337291921", perdido: "1337291922"
}
const HS_STAGE_LEAD_RECEBIDO = process.env.HUBSPOT_STAGE_LEAD_RECEBIDO || HS_STAGE.lead

const monitor = { conversas: 0, cadastros: 0, erros: [], inicio: new Date() }
function logErro(tipo, msg) {
  monitor.erros.push({ tipo, msg, ts: new Date().toISOString() })
  if (monitor.erros.length > 100) monitor.erros.shift()
  console.error(`[${tipo.toUpperCase()}] ${msg}`)
}

const users = {}

function novoUsuario(nomeWA) {
  return {
    stage: "inicio", nomeWA,
    nome: null, regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBolsaFamilia: null, cadastroCRAS: null,
    qtdPessoasCRAS: null, membrosFamiliaCRAS: null, familiaCarteiraAssinada: null,
    descricao: null,
    contatoId: null, negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null, historiaIA: [],
    whatsappVerificado: false, telefoneEhDoCliente: null, whatsappContato: null,
    ultimoMediaId: null, ultimaMidiaTs: 0,
    leadIncompletoCapturado: false,
    timer: null, ultimaMsg: Date.now()
  }
}

function getUser(from, nomeWA) {
  if (!users[from]) { users[from] = novoUsuario(nomeWA); monitor.conversas++ }
  return users[from]
}

// Formata texto livre para o CRM: Title Case + sem acentos
function toTitleCase(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
    .trim()
}
function formatarNome(str) {
  if (!str) return str
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
}
function formatarCidade(str) {
  if (!str) return str
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
    .normalize()
}

function gerarCaso(area) {
  const b = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const p = (n, l = 2) => String(n).padStart(l, "0")
  const prefixos = { "INSS": "PREV", "Trabalhista": "TRAB", "Outros": "CONS", "RevisÃ£o": "DOCS", "Revisao": "DOCS" }
  const prefixo = prefixos[area] || "CASO"
  const num = `${String(b.getFullYear()).slice(2)}${p(b.getMonth()+1)}${p(b.getDate())}${p(b.getHours())}${p(b.getMinutes())}${p(Math.floor(Math.random()*1000), 3)}`
  return `${prefixo}-${num}`
}

function calcScore(u) {
  let s = 0
  if (u.urgencia === "alta") s += 3
  if (u.semReceber) s += 3
  if (u.situacao === "cortado") s += 2
  if (u.situacao === "negado") s += 1
  if (u.documentosEnviados) s += 2
  return s
}

function resumoCaso(u) {
  return [
    `ðŸ‘¤ Nome: ${u.nome || "â€”"}`,
    `ðŸ“ Cidade: ${u.cidade || "â€”"}${u.uf ? " - " + u.uf : ""}`,
    `âš–ï¸ Ãrea: ${u.area || "â€”"}`,
    u.tipo      ? `ðŸ“‹ Tipo: ${u.tipo}` : null,
    u.situacao  ? `ðŸ“Œ SituaÃ§Ã£o: ${u.situacao}` : null,
    u.subTipo   ? `ðŸ”Ž Detalhe: ${u.subTipo}` : null,
    u.detalhe   ? `â„¹ï¸ Info: ${u.detalhe}` : null,
    `âš¡ UrgÃªncia: ${u.urgencia === "alta" ? "Alta ðŸ”´" : "Normal ðŸŸ¡"}`,
    `ðŸ’¼ Contribuiu ao INSS: ${u.contribuicao || "â€”"}`,
    `ðŸ˜ï¸ Possui cadastro no CRAS: ${u.cadastroCRAS || "â€”"}`,
    u.cadastroCRAS === "Sim" && u.qtdPessoasCRAS ? `ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦ Pessoas no cadastro: ${u.qtdPessoasCRAS}` : null,
    u.cadastroCRAS === "Sim" && u.membrosFamiliaCRAS ? `ðŸ§¾ Membros da famÃ­lia: ${u.membrosFamiliaCRAS}` : null,
    u.cadastroCRAS === "Sim" && u.familiaCarteiraAssinada ? `ðŸ’¼ AlguÃ©m da famÃ­lia trabalha de carteira assinada: ${u.familiaCarteiraAssinada}` : null,
    `ðŸ’³ Recebe Bolsa FamÃ­lia: ${u.recebeBolsaFamilia || "â€”"}`,
    u.descricao ? `ðŸ’¬ DescriÃ§Ã£o: ${u.descricao}` : null,
  ].filter(Boolean).join("\n")
}

const DOCS_BASE = [
  {
    id:"doc_rg", label:"RG ou CNH",
    folhas:["Frente","Verso"],
    dica:"ðŸ“¸ Coloque sobre mesa escura. Envie a FRENTE primeiro, depois o VERSO. Sem reflexo, sem partes cortadas."
  },
  {
    id:"doc_cpf", label:"CPF",
    folhas:["Frente"],
    opcional: true,
    dica:"ðŸ“¸ Se o CPF jÃ¡ aparece no RG ou CNH, pode pular. Se tiver o cartÃ£o separado, tire foto nÃ­tida."
  },
  {
    id:"doc_res", label:"Comprovante de ResidÃªncia",
    folhas:["Foto do documento"],
    dica:"ðŸ“¸ Conta de luz, Ã¡gua ou telefone dos Ãºltimos 3 meses. Foto completa, todos os dados visÃ­veis."
  }
]
const DOCS_EXTRA = {
  "aposentadoria": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","PÃ¡ginas com empregos â€” envie cada uma"],
      dica:"ðŸ“’ Fotografe a folha de rosto (seus dados) e TODAS as pÃ¡ginas com registros de emprego, uma foto por pÃ¡gina. Frente e verso se tiver anotaÃ§Ã£o dos dois lados." },
    { id:"doc_cnis", label:"Extrato CNIS (Meu INSS)", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ“± App Meu INSS â†’ Extrato de ContribuiÃ§Ãµes. Tire print de TODAS as pÃ¡ginas ou salve como PDF e envie aqui." },
    { id:"doc_hol", label:"Holerites (12 meses)", folhas:["Cada holerite separado"],
      dica:"ðŸ’° Envie um holerite por foto. Se digitais, print de cada um. Valores devem estar legÃ­veis." }
  ],
  "bpc": [
    { id:"doc_laudo", label:"Laudo MÃ©dico Atualizado", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ¥ Todas as pÃ¡ginas do laudo, sem partes cortadas. Validade mÃ¡xima: 6 meses." },
    { id:"doc_renda", label:"DeclaraÃ§Ã£o de Renda Familiar", folhas:["Foto do documento"],
      dica:"ðŸ“„ Pode ser feita no CRAS ou pelo app Meu INSS. Envie completa." },
    { id:"doc_nasc", label:"CertidÃ£o de Nascimento", folhas:["Frente","Verso"],
      dica:"ðŸ“œ Documento original, frente e verso, sobre fundo escuro." }
  ],
  "incapacidade": [
    { id:"doc_atst", label:"Atestado MÃ©dico Recente", folhas:["Foto do documento"],
      dica:"ðŸ¥ Foto completa com CRM do mÃ©dico visÃ­vel. MÃ¡ximo 90 dias de validade." },
    { id:"doc_exam", label:"Exames e Laudos", folhas:["Cada exame separado"],
      dica:"ðŸ”¬ Um exame por foto. Resultados devem estar completamente legÃ­veis." },
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","PÃ¡ginas com empregos"],
      dica:"ðŸ“’ Folha de rosto + todas as pÃ¡ginas com anotaÃ§Ãµes, uma por vez." }
  ],
  "dependentes": [
    { id:"doc_obito", label:"CertidÃ£o de Ã“bito", folhas:["Frente","Verso"],
      dica:"ðŸ“œ Documento original, frente e verso, sobre fundo escuro." },
    { id:"doc_nasc", label:"CertidÃ£o de Nascimento", folhas:["Frente","Verso"],
      dica:"ðŸ“œ Documento original, frente e verso." }
  ],
  "negado": [
    { id:"doc_indf", label:"Carta de Indeferimento do INSS", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ“„ Foto completa. Se pelo app Meu INSS, print de todas as telas." },
    { id:"doc_ant", label:"Documentos do Pedido Anterior", folhas:["Cada documento separado"],
      dica:"ðŸ“ Todos os documentos do pedido anterior ao INSS, um por foto." }
  ],
  "cortado": [
    { id:"doc_susp", label:"Carta de SuspensÃ£o do BenefÃ­cio", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ“„ Foto da notificaÃ§Ã£o completa recebida do INSS." },
    { id:"doc_laudo", label:"Laudos MÃ©dicos Recentes", folhas:["Cada laudo separado"],
      dica:"ðŸ¥ Laudos com atÃ© 6 meses. Todas as pÃ¡ginas de cada laudo." }
  ],
  "demissao": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","PÃ¡ginas com empregos"],
      dica:"ðŸ“’ Folha de rosto + todas as pÃ¡ginas com anotaÃ§Ãµes de emprego." },
    { id:"doc_demit", label:"Carta de DemissÃ£o", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ“„ Documento completo, assinado pela empresa." },
    { id:"doc_hol", label:"Ãšltimos 3 Holerites", folhas:["Holerite mais recente","Holerite 2","Holerite 3"],
      dica:"ðŸ’° Um holerite por foto, valores legÃ­veis." },
    { id:"doc_fgts", label:"Extrato FGTS", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ“± App FGTS â†’ Extratos. Todas as pÃ¡ginas ou PDF." }
  ],
  "direitos": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","PÃ¡ginas com empregos"],
      dica:"ðŸ“’ Folha de rosto + todas as pÃ¡ginas com registros." },
    { id:"doc_hol", label:"Holerites", folhas:["Cada holerite separado"],
      dica:"ðŸ’° Um por foto, todos legÃ­veis." },
    { id:"doc_fgts", label:"Extrato FGTS", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ“± App FGTS â†’ Extratos. Todas as pÃ¡ginas." },
    { id:"doc_ctr", label:"Contrato de Trabalho", folhas:["Cada pÃ¡gina separada"],
      dica:"ðŸ“ Todas as pÃ¡ginas assinadas, frente e verso." }
  ],
  "acidente": [
    { id:"doc_cat", label:"CAT (ComunicaÃ§Ã£o de Acidente)", folhas:["Todas as pÃ¡ginas"],
      dica:"ðŸ“‹ Documento CAT completo. Se nÃ£o tiver, informe ao advogado." },
    { id:"doc_atst", label:"Atestado MÃ©dico", folhas:["Foto do documento"],
      dica:"ðŸ¥ Foto nÃ­tida com CRM do mÃ©dico visÃ­vel." },
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","PÃ¡ginas com empregos"],
      dica:"ðŸ“’ Folha de rosto + pÃ¡ginas com registros." }
  ],
  "assedio": [
    { id:"doc_print", label:"Prints ou Registros", folhas:["Cada print separado"],
      dica:"ðŸ“± Um print por foto, organizados por data." },
    { id:"doc_test", label:"Nomes de Testemunhas", folhas:["Mensagem de texto"],
      dica:"âœï¸ Digite aqui os nomes e telefones de quem presenciou os fatos." },
    { id:"doc_hol", label:"Contracheques", folhas:["Cada um separado"],
      dica:"ðŸ’° Um por foto, legÃ­veis." }
  ],
  "revisao": [
    { id:"doc_orig", label:"Documento para RevisÃ£o", folhas:["Cada pÃ¡gina separada"],
      dica:"ðŸ“„ Todas as pÃ¡ginas em fotos separadas, ou envie como PDF." }
  ]
}
function getDocumentosLista(area, tipo) {
  const chave = (tipo || area || "outros").toLowerCase()
  const extra = DOCS_EXTRA[chave] || [{ id:"doc_out", label:"Documentos do seu caso", folhas:["Cada documento separado"], dica:"ðŸ“¸ Envie os documentos relacionados ao seu caso." }]
  return chave === "revisao" ? extra : [...DOCS_BASE, ...extra]
}
function getDocumentos(area, tipo) {
  return getDocumentosLista(area, tipo).map(d => "- " + d.label).join("\n")
}

function telaPerguntaWhatsApp(from) {
  return {
    texto: `ðŸ“± Esse nÃºmero *${from}* Ã© o WhatsApp da pessoa que serÃ¡ atendida?\n\nAssim nossa equipe fala com a pessoa certa. ðŸ’¬`,
    opcoes: [
      { id: "tel_meu",   title: "âœ… Sim, Ã© meu" },
      { id: "tel_outro", title: "ðŸ‘¤ Outra pessoa" }
    ]
  }
}

function midiaDuplicada(u, mediaId) {
  if (!u || !mediaId) return false
  const agora = Date.now()
  const duplicada = u.ultimoMediaId === mediaId && (agora - (u.ultimaMidiaTs || 0)) < 2 * 60 * 1000
  u.ultimoMediaId = mediaId
  u.ultimaMidiaTs = agora
  return duplicada
}

function limparTimer(u) {
  if (u.timer) { clearTimeout(u.timer); u.timer = null }
}

function iniciarTimer(from) {
  const u = users[from]
  if (!u) return
  limparTimer(u)
  // Se cliente estÃ¡ gravando Ã¡udio ou descrevendo o caso, dar mais tempo antes de interromper
  const estaDescrevendo = u.stage === "coleta_desc_audio" || u.stage === "coleta_desc"
  const t1 = estaDescrevendo ? 5 * 60 * 1000 : 2 * 60 * 1000
  u.timer = setTimeout(async () => {
    if (!users[from]) return
    await enviar(from, "Oi ðŸ˜Š fiquei te esperando... posso te ajudar a continuar?", null)
    u.timer = setTimeout(async () => {
      if (!users[from]) return
      await enviar(from, "Vou pausar por agora, tudo bem? Se precisar, Ã© sÃ³ responder. ðŸ˜Š", null)
      u.timer = setTimeout(async () => {
        if (!users[from]) return
        await capturarLeadIncompleto(from, users[from], "timeout")
        await enviar(from, "Encerrando atendimento. Quando quiser continuar, Ã© sÃ³ enviar uma mensagem. ðŸ‘‹", null)
        const nomeWA = users[from].nomeWA
        users[from] = novoUsuario(nomeWA)
      }, 2 * 60 * 1000)
    }, 3 * 60 * 1000)
  }, t1)
}

const HS = () => ({ Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" })

async function hsBuscarPorPhone(phone) {
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      { filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }] },
      { headers: HS() }
    )
    return res.data.results?.[0] || null
  } catch { return null }
}

async function hsCriarContato(from, u) {
  const props = { firstname: formatarNome(u.nome || u.nomeWA || ""), phone: from, city: u.cidade || "" }
  const custom = {
    numero_caso: u.numeroCaso, area_juridica: u.area,
    situacao_caso: [u.situacao, u.subTipo].filter(Boolean).join(" > "),
    status_caso: u.urgencia === "alta" ? "urgente" : "em analise",
    pasta_drive: u.pastaDriveLink || ""
  }
  try {
    const res = await axios.post("https://api.hubapi.com/crm/v3/objects/contacts", { properties: { ...props, ...custom } }, { headers: HS() })
    monitor.cadastros++
    return res.data.id
  } catch {
    try {
      const res = await axios.post("https://api.hubapi.com/crm/v3/objects/contacts", { properties: props }, { headers: HS() })
      monitor.cadastros++
      return res.data.id
    } catch (e) { logErro("hubspot", "criarContato: " + (e.response?.data?.message || e.message)); return null }
  }
}

async function hsAtualizarContato(cId, from, u) {
  if (!cId) return
  const props = {
    phone: from,
    firstname: formatarNome(u.nome || u.nomeWA || "") || undefined,
    city: u.cidade || undefined,
    numero_caso: u.numeroCaso || undefined,
    area_juridica: u.area || undefined,
    situacao_caso: [u.situacao, u.subTipo].filter(Boolean).join(" > ") || undefined,
    status_caso: u.numeroCaso ? (u.urgencia === "alta" ? "urgente" : "em analise") : "lead incompleto",
    pasta_drive: u.pastaDriveLink || undefined
  }
  try {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${cId}`,
      { properties: Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== "")) },
      { headers: HS() }
    )
  } catch (e) { logErro("hubspot", "atualizarContato: " + (e.response?.data?.message || e.message)) }
}

async function hsCriarNegocio(u) {
  try {
    const stage = u.urgencia === "alta" ? HS_STAGE.triagem : HS_STAGE.lead
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/deals",
      { properties: { dealname: `${u.nome} â€” ${u.area} â€” ${u.numeroCaso}`, pipeline: HS_PIPELINE, dealstage: stage } },
      { headers: HS() }
    )
    return res.data.id
  } catch (e) { logErro("hubspot", "criarNegocio: " + (e.response?.data?.message || e.message)); return null }
}

async function hsCriarNegocioLeadIncompleto(from, u) {
  try {
    const nomeLead = u.nome || u.nomeWA || from
    const partes = [nomeLead, u.area || "Lead recebido", "Lead incompleto"]
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/deals",
      {
        properties: {
          dealname: partes.join(" â€” "),
          pipeline: HS_PIPELINE,
          dealstage: HS_STAGE_LEAD_RECEBIDO
        }
      },
      { headers: HS() }
    )
    return res.data.id
  } catch (e) { logErro("hubspot", "criarNegocioLead: " + (e.response?.data?.message || e.message)); return null }
}

async function hsAtualizarNegocio(nId, u) {
  if (!nId) return
  try {
    const stage = u.urgencia === "alta" ? HS_STAGE.triagem : HS_STAGE.lead
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/deals/${nId}`,
      { properties: { dealname: `${u.nome} â€” ${u.area} â€” ${u.numeroCaso}`, pipeline: HS_PIPELINE, dealstage: stage } },
      { headers: HS() }
    )
  } catch (e) { logErro("hubspot", "atualizarNegocio: " + (e.response?.data?.message || e.message)) }
}

async function hsAssociar(cId, nId) {
  try {
    await axios.put(`https://api.hubapi.com/crm/v3/objects/deals/${nId}/associations/contacts/${cId}/deal_to_contact`, {}, { headers: HS() })
  } catch (e) { logErro("hubspot", "associar: " + (e.response?.data?.message || e.message)) }
}

async function hsMoverStage(nId, stage) {
  if (!nId) return
  try {
    await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${nId}`, { properties: { dealstage: stage } }, { headers: HS() })
  } catch (e) { logErro("hubspot", "moverStage: " + (e.response?.data?.message || e.message)) }
}

async function hsCriarNota(cId, tipo, corpo) {
  if (!cId) return
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/notes",
      { properties: { hs_note_body: `[${tipo}]\n\n${corpo}`, hs_timestamp: String(Date.now()) } },
      { headers: HS() }
    )
    await axios.put(`https://api.hubapi.com/crm/v3/objects/notes/${res.data.id}/associations/contacts/${cId}/note_to_contact`, {}, { headers: HS() })
  } catch (e) { logErro("hubspot", "criarNota: " + (e.response?.data?.message || e.message)) }
}

async function capturarLeadIncompleto(from, u, motivo = "abandono") {
  if (!u || !from || u.numeroCaso || u.leadIncompletoCapturado || u.negocioId) return

  const existente = u.contatoId ? { id: u.contatoId } : await hsBuscarPorPhone(from)
  let contatoId = existente?.id || null

  if (!contatoId) {
    contatoId = await hsCriarContato(from, {
      ...u,
      pastaDriveLink: null,
      numeroCaso: null,
      urgencia: "normal"
    })
  } else {
    await hsAtualizarContato(contatoId, from, { ...u, numeroCaso: null, pastaDriveLink: null })
  }

  let negocioId = null
  if (contatoId) {
    negocioId = await hsCriarNegocioLeadIncompleto(from, u)
    if (negocioId) {
      await hsAssociar(contatoId, negocioId)
      await hsCriarNota(
        contatoId,
        "LEAD INCOMPLETO",
        [
          `Motivo: ${motivo}`,
          `WhatsApp: ${from}`,
          `Nome informado: ${u.nome || "nao informado"}`,
          `Nome no WhatsApp: ${u.nomeWA || "nao informado"}`,
          `Stage interrompido: ${u.stage || "nao informado"}`,
          u.area ? `Area: ${u.area}` : null,
          u.situacao ? `Situacao: ${u.situacao}` : null,
          u.subTipo ? `Detalhe: ${u.subTipo}` : null
        ].filter(Boolean).join("\n")
      )
    }
  }

  u.contatoId = contatoId
  u.negocioId = negocioId
  u.leadIncompletoCapturado = Boolean(contatoId && negocioId)
}

function getDrive() {
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "urn:ietf:wg:oauth:2.0:oob")
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: "v3", auth: oauth2 })
}

// IDs das subpastas por Ã¡rea â€” crie estas pastas no Drive e coloque os IDs no .env
// DRIVE_ID_INSS, DRIVE_ID_TRAB, DRIVE_ID_OUTROS
// Se nÃ£o configurados, usa a pasta raiz de clientes
function escapeDriveQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function getNomePastaArea(area, situacao, tipo) {
  if (area === "INSS") return "PrevidenciÃ¡rio"
  if (area === "Trabalhista") return "Trabalhista"
  if (situacao === "Consultoria juridica") return "Consulta JurÃ­dica"
  if (situacao === "Revisao de documentos" || tipo === "revisao") return "RevisÃ£o de documentos"
  return "Outros"
}

async function obterOuCriarPastaArea(area, situacao, tipo) {
  const drive = getDrive()
  const nomeArea = getNomePastaArea(area, situacao, tipo)
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${escapeDriveQueryValue(nomeArea)}'`,
    `'${DRIVE_PASTA_CLIENTES_ID}' in parents`,
    "trashed = false"
  ].join(" and ")

  const existentes = await drive.files.list({
    q: query,
    fields: "files(id,name,webViewLink)",
    pageSize: 1
  })

  if (existentes.data.files?.length) return existentes.data.files[0]

  const criada = await drive.files.create({
    requestBody: {
      name: nomeArea,
      mimeType: "application/vnd.google-apps.folder",
      parents: [DRIVE_PASTA_CLIENTES_ID]
    },
    fields: "id,name,webViewLink"
  })

  console.log(`[DRIVE] Pasta da area criada: ${criada.data.name}`)
  return criada.data
}

async function criarPastaCliente(numeroCaso, nome, area, situacao, tipo) {
  try {
    const nomeArea = getNomePastaArea(area, situacao, tipo)
    const pastaArea = await obterOuCriarPastaArea(area, situacao, tipo)
    const pastaAreaId = pastaArea?.id || DRIVE_PASTA_CLIENTES_ID
    const res = await getDrive().files.create({
      requestBody: { name: `${numeroCaso} - ${nome}`, mimeType: "application/vnd.google-apps.folder", parents: [pastaAreaId] },
      fields: "id,name,webViewLink"
    })
    console.log(`[DRIVE] Pasta criada: ${res.data.name} (Ã¡rea: ${nomeArea})`)
    return res.data
  } catch (e) { logErro("drive", "criarPasta: " + e.message); return null }
}

async function uploadDrive(pastaId, nome, buffer, mimeType) {
  const fs      = require("fs")
  const path    = require("path")
  const os      = require("os")
  const seguro  = nome.replace(/[^a-zA-Z0-9._-]/g, "_")
  const tmpPath = path.join(os.tmpdir(), `oraculum_${Date.now()}_${seguro}`)
  try {
    if (!buffer || buffer.length === 0) {
      logErro("drive", `upload "${nome}": buffer vazio`)
      return null
    }
    fs.writeFileSync(tmpPath, buffer)
    const drive = getDrive()
    const res   = await drive.files.create({
      requestBody: { name: nome, parents: [pastaId] },
      media: { mimeType: mimeType || "application/octet-stream", body: fs.createReadStream(tmpPath) },
      fields: "id,name,webViewLink"
    })
    console.log(`[DRIVE] Upload OK: ${res.data.name} (${res.data.id})`)
    return res.data
  } catch (e) {
    const status  = e.response?.status || "sem_status"
    const detalhe = e.response?.data?.error?.message || e.response?.data?.message || e.message
    logErro("drive", `upload "${nome}" [HTTP ${status}]: ${detalhe}`)
    return null
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

async function transcrever(buffer, mimeType) {
  try {
    if (!ASSEMBLYAI_KEY) {
      logErro("assemblyai", "ASSEMBLYAI_KEY ausente")
      return null
    }
    const mime = String(mimeType || "audio/ogg").toLowerCase()
    const mimeSuportado = [
      "audio/ogg", "audio/ogg; codecs=opus", "audio/opus", "audio/mpeg", "audio/mp3",
      "audio/mp4", "audio/x-m4a", "audio/wav", "audio/webm", "audio/flac", "audio/aac"
    ].some(m => mime.includes(m))
    if (!mimeSuportado) {
      logErro("assemblyai", `mime nao suportado para transcricao: ${mime}`)
      return null
    }
    const up = await axios.post("https://api.assemblyai.com/v2/upload", buffer, {
      headers: {
        authorization: ASSEMBLYAI_KEY,
        "content-type": "application/octet-stream",
        "content-length": buffer.length
      },
      maxBodyLength: Infinity
    })
    if (!up.data?.upload_url) {
      logErro("assemblyai", `upload sem URL retornada: ${JSON.stringify(up.data || {})}`)
      return null
    }
    const tr = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: up.data.upload_url, language_code: "pt" },
      { headers: { authorization: ASSEMBLYAI_KEY, "content-type": "application/json" } }
    )
    if (!tr.data?.id) {
      logErro("assemblyai", `transcript sem id retornado: ${JSON.stringify(tr.data || {})}`)
      return null
    }
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const p = await axios.get(`https://api.assemblyai.com/v2/transcript/${tr.data.id}`, { headers: { authorization: ASSEMBLYAI_KEY } })
      if (p.data.status === "completed") return p.data.text || ""
      if (p.data.status === "error") {
        logErro("assemblyai", `transcricao falhou [${tr.data.id}]: ${p.data.error || "sem detalhe"}`)
        return null
      }
    }
    logErro("assemblyai", `timeout aguardando transcricao [${tr.data.id}]`)
    return null
  } catch (e) {
    const status  = e.response?.status || "sem_status"
    const detalhe = e.response?.data?.error || e.response?.data?.message || e.message
    logErro("assemblyai", `transcrever [HTTP ${status}]: ${detalhe}`)
    return null
  }
}

async function respostaIA(u, pergunta) {
  if (!GROQ_KEY) return null
  try {
    const sistema = `Voce e Beatriz, assistente virtual da Oraculum Advocacia. Responda duvidas juridicas de forma clara e acessivel para leigos. Areas: INSS, Trabalhista, Familia, Civel. Nunca prometa resultados. Seja objetiva e empatica. Dados do cliente: Area: ${u.area || "nao informado"} | Caso: ${u.numeroCaso || "nao cadastrado"}.`
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

async function excluirDrive(fileId) {
  if (!fileId) return
  try { await getDrive().files.delete({ fileId }); console.log(`[DRIVE] ExcluÃ­do: ${fileId}`) }
  catch (e) { logErro("drive", "excluir: " + e.message) }
}

async function uploadPastaAudio(pastaDriveId, nomeCliente, nomePasta, buffer, mimeType) {
  // Cria subpasta "Ãudios - <nomePasta>" dentro da pasta do cliente
  try {
    const drive = getDrive()
    const pasta = await drive.files.create({
      requestBody: { name: `Ãudios - ${nomePasta}`, mimeType: "application/vnd.google-apps.folder", parents: [pastaDriveId] },
      fields: "id"
    })
    const ext = mimeType?.includes("ogg") ? ".ogg" : mimeType?.includes("mpeg") ? ".mp3" : ".ogg"
    const nomeArq = `Audio - ${nomeCliente}${ext}`
    const fs = require("fs"), path = require("path"), os = require("os")
    const tmp = path.join(os.tmpdir(), `orac_audio_${Date.now()}`)
    fs.writeFileSync(tmp, buffer)
    const res = await drive.files.create({
      requestBody: { name: nomeArq, parents: [pasta.data.id] },
      media: { mimeType: mimeType || "audio/ogg", body: fs.createReadStream(tmp) },
      fields: "id,name,webViewLink"
    })
    try { fs.unlinkSync(tmp) } catch {}
    console.log(`[DRIVE] Ãudio: ${res.data.name}`)
    return res.data
  } catch (e) { logErro("drive", "uploadAudio: " + e.message); return null }
}

async function baixarMidia(mediaId) {
  try {
    const info = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } })
    const file = await axios.get(info.data.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, responseType: "arraybuffer" })
    return { buffer: Buffer.from(file.data), mimeType: info.data.mime_type || "application/octet-stream" }
  } catch (e) { logErro("whatsapp", "baixarMidia: " + e.message); return null }
}

async function digitando(to) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product:"whatsapp", to, type:"text", text:{ body:"..." } },
      { headers:{ Authorization:`Bearer ${WHATSAPP_TOKEN}`, "Content-Type":"application/json" } })
  } catch {}
  await new Promise(r => setTimeout(r, 3200))
}

async function enviar(to, texto, opcoes = null, comDelay = true) {
  try {
    if (comDelay) await digitando(to)
    let body
    if (!opcoes || opcoes.length === 0) {
      body = { messaging_product: "whatsapp", to, type: "text", text: { body: texto } }
    } else if (opcoes.length <= 3) {
      body = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: { type: "button", body: { text: texto }, action: { buttons: opcoes.map(o => ({ type: "reply", reply: { id: o.id, title: String(o.title).slice(0, 20) } })) } }
      }
    } else {
      const sections = []
      for (let i = 0; i < opcoes.length; i += 10)
        sections.push({ title: "Opcoes", rows: opcoes.slice(i, i + 10).map(o => ({ id: o.id, title: String(o.title).slice(0, 24) })) })
      body = {
        messaging_product: "whatsapp", to, type: "interactive",
      interactive: { type: "list", body: { text: texto }, action: { button: "📋 Ver opções", sections } }
      }
    }
    await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, body, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
    })
  } catch (e) { logErro("whatsapp", `>${to}: ` + (e.response?.data?.error?.message || e.message)) }
}

const UF_MAP = {
  uf_ac:"AC", uf_al:"AL", uf_am:"AM", uf_ap:"AP", uf_ba:"BA", uf_ce:"CE",
  uf_df:"DF", uf_es:"ES", uf_go:"GO", uf_ma:"MA", uf_mg:"MG", uf_ms:"MS",
  uf_mt:"MT", uf_pa:"PA", uf_pb:"PB", uf_pe:"PE", uf_pi:"PI", uf_pr:"PR",
  uf_rj:"RJ", uf_rn:"RN", uf_ro:"RO", uf_rr:"RR", uf_rs:"RS", uf_sc:"SC",
  uf_se:"SE", uf_sp:"SP", uf_to:"TO"
}
const REGIOES = {
  reg_n:  { label:"Norte",        ufs:[["uf_ac","AC"],["uf_am","AM"],["uf_ap","AP"],["uf_pa","PA"],["uf_ro","RO"],["uf_rr","RR"],["uf_to","TO"]] },
  reg_ne: { label:"Nordeste",     ufs:[["uf_al","AL"],["uf_ba","BA"],["uf_ce","CE"],["uf_ma","MA"],["uf_pb","PB"],["uf_pe","PE"],["uf_pi","PI"],["uf_rn","RN"],["uf_se","SE"]] },
  reg_co: { label:"Centro-Oeste", ufs:[["uf_df","DF"],["uf_go","GO"],["uf_ms","MS"],["uf_mt","MT"]] },
  reg_se: { label:"Sudeste",      ufs:[["uf_es","ES"],["uf_mg","MG"],["uf_rj","RJ"],["uf_sp","SP"]] },
  reg_s:  { label:"Sul",          ufs:[["uf_pr","PR"],["uf_rs","RS"],["uf_sc","SC"]] }
}
function telaRegioes() {
  return { texto:"Selecione sua RegiÃ£o no Brasil", opcoes:[
    { id:"reg_n", title:"Norte" }, { id:"reg_ne", title:"Nordeste" },
    { id:"reg_co", title:"Centro-Oeste" }, { id:"reg_se", title:"Sudeste" },
    { id:"reg_s", title:"Sul" }
  ]}
}
function telaUFsRegiao(regId) {
  const reg = REGIOES[regId]
  if (!reg) return telaRegioes()
  return { texto: reg.label + " â€” escolha seu estado:", opcoes: reg.ufs.map(([id,title]) => ({ id, title })) }
}

async function finalizarCadastro(from, u) {
  const numeroCaso = gerarCaso(u.area)
  u.numeroCaso  = numeroCaso
  u.score       = calcScore(u)
  u.docsEntregues = []; u.docAtualIdx = 0; u.ultimoArqId = null

  const pasta      = await criarPastaCliente(numeroCaso, u.nome, u.area, u.situacao, u.tipo)
  u.pastaDriveId   = pasta?.id || null
  u.pastaDriveLink = pasta?.webViewLink || null

  const existente = await hsBuscarPorPhone(from)
  let contatoId   = existente?.id || null
  if (!contatoId) contatoId = await hsCriarContato(from, u)
  else {
    console.log(`[HUBSPOT] Contato existente: ${contatoId}`)
    await hsAtualizarContato(contatoId, from, u)
  }
  u.contatoId = contatoId

  let negocioId = u.negocioId || null
  if (!negocioId) negocioId = await hsCriarNegocio(u)
  else await hsAtualizarNegocio(negocioId, u)
  u.negocioId     = negocioId
  if (contatoId && negocioId) await hsAssociar(contatoId, negocioId)
  u.leadIncompletoCapturado = false

  if (contatoId) {
    await hsCriarNota(contatoId, "CADASTRO COMPLETO", resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "â€”"}\nWhatsApp: ${from}`)
  }

  // Salvar Ã¡udio de descriÃ§Ã£o guardado antes do cadastro
  if (u._audioDescBuffer && u.pastaDriveId) {
    try {
      await uploadPastaAudio(u.pastaDriveId, u._audioDescNome || "cliente", "Descricao do Caso", u._audioDescBuffer, u._audioDescMime)
      u._audioDescBuffer = null; u._audioDescMime = null; u._audioDescNome = null
      console.log("[DRIVE] Ãudio de descriÃ§Ã£o salvo apÃ³s cadastro")
    } catch (e) { logErro("drive", "salvarAudioDesc: " + e.message) }
  }

  u.stage = "cliente"
  return numeroCaso
}

function tela_confirmacao(u) {
  return {
    texto: `âœ… *Confira seus dados antes de confirmar:*\n\n${resumoCaso(u)}\n\nTudo estÃ¡ correto?`,
    opcoes: [{ id: "conf_ok", title: "âœ… Confirmar" }, { id: "conf_corrigir", title: "âœï¸ Corrigir dados" }]
  }
}

function menuCliente(u) {
  const partes = (u.nome || u.nomeWA).split(" ")
  const nomeExib = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0]
  const prioridade = u.urgencia === "alta" ? "\nðŸ”´ Prioridade: Alta" : ""
  return {
    texto: `ðŸ‘‹ OlÃ¡, *${nomeExib}*!\n\nBem-vindo de volta Ã  *Oraculum Advocacia* âš–ï¸\n\nðŸ“„ Caso: *${u.numeroCaso}*\nâš–ï¸ Ãrea: ${u.area}${prioridade}\n\nComo posso te ajudar hoje?`,
    opcoes: [
      { id: "m_status",  title: "📊 Status" },
      { id: "m_docs",    title: "ðŸ“Ž Enviar documentos" },
      { id: "m_adv",     title: "ðŸ‘¨â€âš–ï¸ Falar c/ advogado" },
      { id: "m_novocaso", title: "âž• Novo caso" }
    ]
  }
}

function getDocsPendentes(u) {
  const lista = getDocumentosLista(u.area, u.tipo || u.situacao)
  return lista.filter(d => !(u.docsEntregues || []).includes(d.id))
}

function telaConcluido(u) {
  const nome1 = (u.nome || u.nomeWA).split(" ")[0]
  return {
    texto: `🎉 *Muito bem, ${nome1}!*\n\nTodos os documentos foram enviados com sucesso! Nossa equipe já pode analisar seu caso com prioridade.\n\nEntraremos em contato em breve pelo WhatsApp. 💬\n\n📁 Caso: *${u.numeroCaso}*\n⏱️ Retorno em até *2 dias úteis*.`,
    opcoes: [{ id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_status", title:"📊 Status" }, { id:"m_inicio", title:"🏠 Menu" }]
  }
}

function telaEnvioDoc(u) {
  const pendentes = getDocsPendentes(u)
  if (pendentes.length === 0) return telaConcluido(u)

  const lista    = getDocumentosLista(u.area, u.tipo || u.situacao)
  const total    = lista.length
  const entregue = total - pendentes.length
  const barras   = "ðŸŸ¢".repeat(entregue) + "ðŸ”´".repeat(pendentes.length)
  const doc      = pendentes[0]
  const folhas   = doc.folhas || ["Foto do documento"]
  const fIdx     = u.docAtualIdx || 0
  const folha    = folhas[fIdx] || `Foto ${fIdx + 1}`
  const totalF   = folhas.length

  let texto = `ðŸ“‹ *Documentos do caso*\n${barras} ${entregue}/${total}\n\n`
  texto += `ðŸ“Œ *Agora:* ${doc.label}\n`
  texto += `ðŸ“„ *Envie:* ${folha}`
  if (totalF > 1) texto += ` (${fIdx + 1} de ${totalF})`
  texto += `\n\nðŸ’¡ *Dica:* ${doc.dica}`
  texto += `\n\nðŸ“² *Tire a foto ou PDF e envie aqui.*`

  // CPF Ã© opcional â€” oferecer opÃ§Ã£o de pular
  if (doc.id === "doc_cpf") {
    texto += "\n\nðŸ’¡ *Se o seu CPF jÃ¡ aparece no RG ou CNH, pode pular este documento.*"
    return {
      texto,
      opcoes: [
        { id:"doc_cpf_skip", title:"âœ… JÃ¡ estÃ¡ no RG" },
        { id:"docs_depois",  title:"â­ï¸ Enviar depois" },
      { id:"m_inicio",     title:"🏠 Menu" }
      ]
    }
  }

  return {
    texto,
    opcoes: [{ id:"docs_depois", title:"⏭️ Enviar depois" }, { id:"m_inicio", title:"🏠 Menu" }]
  }
}

async function processar(from, nomeWA, text, msgObj) {
  const u    = getUser(from, nomeWA)
  u.ultimaMsg = Date.now()
  limparTimer(u)
  if (!u.numeroCaso && !u.contatoId && !u.negocioId) await capturarLeadIncompleto(from, u, "primeiro_contato")

  const tipo    = msgObj?.type
  const ehAudio = tipo === "audio"
  const ehDoc   = tipo === "document" || tipo === "image"
  const lower   = (text || "").toLowerCase()

  if (text && u.stage !== "cliente" && !u.numeroCaso) {
    const palavrasEncerrar = ["encerrar","encerra","tchau","ate logo","boa noite","boa tarde","bom dia","obrigado","obrigada","ate mais","pode encerrar","finalizar","finalize","fecha","fechar","ate breve","por hoje","cancelar","cancelamento","parar"]
    if (palavrasEncerrar.some(p => lower.includes(p))) {
      await capturarLeadIncompleto(from, u, "saida_fluxo")
      const nome1 = (u.nome || u.nomeWA).split(" ")[0]
      users[from] = novoUsuario(u.nomeWA)
      return { texto: `Tudo bem, ${nome1}. Registrei seu contato e, se precisar continuar depois, Ã© sÃ³ mandar mensagem por aqui.`, opcoes: null }
    }
  }

  // MIDIA
  if ((ehAudio || ehDoc) && (u.stage === "cliente" || u.stage === "aguardando_urgente" || u.stage === "coleta_desc_audio")) {
    const mediaId  = msgObj?.[tipo]?.id
    const nomeArq  = msgObj?.document?.filename || (tipo === "image" ? `imagem_${Date.now()}.jpg` : `audio_${Date.now()}`)
    const mimeType = msgObj?.[tipo]?.mime_type || "application/octet-stream"

    if (!mediaId) {
      iniciarTimer(from)
      return { texto: "Nao consegui identificar o arquivo. Tente enviar novamente como foto ou PDF.", opcoes: [{ id:"m_docs", title:"🔄 Tentar" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }
    if (ehAudio && midiaDuplicada(u, mediaId)) {
      console.log(`[AUDIO] Midia duplicada ignorada: ${mediaId}`)
      return { texto: null, opcoes: null }
    }
    // Durante coleta_desc_audio a pasta ainda nÃ£o existe â€” Ã¡udio Ã© salvo apÃ³s cadastro
    if (!u.pastaDriveId && u.stage !== "coleta_desc_audio") {
      iniciarTimer(from)
      return { texto: "⏳ Sua pasta está sendo preparada. Aguarde um instante e tente novamente.", opcoes: [{ id:"m_docs", title:"🔄 Tentar" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }

    const midia = await baixarMidia(mediaId)
    if (!midia) {
      iniciarTimer(from)
      return { texto: "❌ Não consegui baixar o arquivo. Tente reenviar.", opcoes: [{ id:"m_docs", title:"🔄 Tentar" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }

    // â”€â”€ ÃUDIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (ehAudio) {
      await enviar(from, "ðŸŽ™ï¸ Ãudio recebido! Transcrevendo, aguarde...", null, false)
      const eUrg   = u.stage === "aguardando_urgente"
      // Determina nome da subpasta pelo stage
      const eDescricao = u.stage === "coleta_desc_audio"
      const nomePasta  = eUrg ? "Mensagem Urgente" : (eDescricao ? "Descricao do Caso" : "Audio Geral")
      const prNome = formatarNome(u.nome || u.nomeWA || "cliente").split(" ")[0]
      const ultNome = formatarNome(u.nome || u.nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
      const nomeCliente = ultNome && ultNome !== prNome ? `${prNome} ${ultNome}` : prNome

      const trans = await transcrever(midia.buffer, midia.mimeType)

      let arquivoAud = null
      if (u.pastaDriveId && !eDescricao) {
        arquivoAud = await uploadPastaAudio(u.pastaDriveId, nomeCliente, nomePasta, midia.buffer, midia.mimeType)
      }

      if (!eDescricao) {
        await hsCriarNota(u.contatoId, eUrg ? "ÃUDIO URGENTE" : `ÃUDIO â€” ${nomePasta.toUpperCase()}`,
          `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\n\n${trans ? `TranscriÃ§Ã£o:\n"${trans}"` : "TranscriÃ§Ã£o indisponÃ­vel"}${arquivoAud ? `\nDrive: ${arquivoAud.webViewLink}` : ""}`)
      }
      if (eUrg) await hsMoverStage(u.negocioId, HS_STAGE.triagem)
      u.documentosEnviados = true
      if (u.stage === "aguardando_urgente") u.stage = "cliente"

      // Se Ã© descriÃ§Ã£o do caso por Ã¡udio â€” salvar transcriÃ§Ã£o e ir para confirmaÃ§Ã£o
      if (eDescricao) {
        u._audioDescBuffer  = midia.buffer
        u._audioDescMime    = midia.mimeType
        u._audioDescNome    = nomeCliente
        if (!trans) {
          iniciarTimer(from)
          return { texto: "Não consegui transcrever o áudio. Pode tentar novamente ou enviar por texto.", opcoes: null }
        }
        u._descTemp         = `[Áudio transcrito] ${trans.slice(0, 500)}`
        u.stage = "desc_confirma"; iniciarTimer(from)
        const msg = `🎙️ *Áudio recebido e transcrito!*\n\n📝 *O que entendemos:*\n\n"${trans.slice(0, 400)}${trans.length > 400 ? "..." : ""}"\n\nConfirme ou corrija as informações:`
        return { texto: msg, opcoes: [{ id:"desc_ok", title:"✅ Confirmar" }, { id:"desc_corrigir", title:"🔄 Corrigir" }] }
      }

      const msgAudio = trans
        ? `✅ Áudio salvo!\n\n🗣️ O que entendemos:\n"${trans.slice(0, 300)}${trans.length > 300 ? "..." : ""}"`
        : `Não consegui transcrever o áudio. Pode tentar novamente ou enviar por texto.`
      iniciarTimer(from)
      return { texto: msgAudio, opcoes: [{ id:"m_docs", title:"📎 Enviar docs" }, { id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }

    // â”€â”€ DOCUMENTO / IMAGEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await hsMoverStage(u.negocioId, HS_STAGE.docs)
    if (!u.docsEntregues) u.docsEntregues = []

    const pendentes   = getDocsPendentes(u)
    const docAtual    = pendentes[0]
    const folhas      = docAtual?.folhas || ["Foto"]
    const fIdx        = u.docAtualIdx || 0
    const folha       = folhas[fIdx] || `Foto ${fIdx + 1}`

    // Nome formatado: "RG ou CNH - Frente - JosÃ© Silva.jpg"
    const prN  = formatarNome(u.nome || u.nomeWA || "cliente").split(" ")[0]
    const ulN  = formatarNome(u.nome || u.nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
    const nCli = ulN && ulN !== prN ? `${prN} ${ulN}` : prN
    const lblD = docAtual ? docAtual.label : "Documento"
    const ext2 = (nomeArq || "").split(".").pop()
    const nArqFinal = `${lblD} - ${folha} - ${nCli}${ext2 && ext2.length <= 4 ? "."+ext2 : ".jpg"}`

    const arquivo = await uploadDrive(u.pastaDriveId, nArqFinal, midia.buffer, midia.mimeType)
    if (!arquivo) {
      iniciarTimer(from)
      return { texto: "❌ Não consegui salvar. Pode tentar novamente?", opcoes: [{ id:"m_docs", title:"🔄 Tentar" }, { id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }

    u.ultimoArqId   = arquivo.id
    u.ultimoArqNome = nArqFinal
    u.documentosEnviados = true
    if (u.stage === "aguardando_urgente") u.stage = "cliente"

    await hsCriarNota(u.contatoId, "DOCUMENTO RECEBIDO",
      `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArquivo: ${nArqFinal}\nDrive: ${arquivo.webViewLink}`)

    // AvanÃ§ar Ã­ndice de folha
    u.docAtualIdx = fIdx + 1
    const temProxFolha = docAtual && u.docAtualIdx < (docAtual.folhas || []).length
    const proxFolha    = docAtual?.folhas?.[u.docAtualIdx] || `Foto ${u.docAtualIdx + 1}`

    iniciarTimer(from)

    return {
      texto: `âœ… *${lblD} â€” ${folha}* recebida!\nðŸ“ Salvo como: ${nArqFinal}\n\nO que deseja fazer agora?`,
      opcoes: [
        { id:"docs_reenviar",  title:"ðŸ”„ Reenviar esta foto" },
        { id:"docs_maisFotos", title:"ðŸ“¸ Mais fotos deste doc" },
        { id:"docs_proxdoc",   title:"âœ… PrÃ³ximo documento" },
        { id:"docs_depois",    title:"â­ï¸ Enviar depois" }
      ]
    }
  }

  // URGENTE TEXTO â€” ignora cliques em botÃ£o (id curto como "m_inicio")
  if (u.stage === "aguardando_urgente" && text && !ehDoc && !ehAudio) {
    // Se for id de botÃ£o, sai do modo urgente e redireciona normalmente
    if (/^[a-z][a-z0-9_]{1,20}$/.test(text)) {
      u.stage = "cliente"
      // deixa cair para o bloco MENU CLIENTE abaixo
    } else {
      await hsCriarNota(u.contatoId, "MENSAGEM URGENTE", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArea: ${u.area}\n\n${text}`)
      await hsMoverStage(u.negocioId, HS_STAGE.triagem)
      u.stage = "cliente"
      iniciarTimer(from)
      return { texto: `✅ *Mensagem registrada com urgência!*\n\nNossa equipe será notificada imediatamente. ⚡\n\n📄 Caso: *${u.numeroCaso}*`, opcoes: [{ id:"m_status", title:"📊 Status" }, { id:"m_docs", title:"📎 Enviar docs" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }
  }

  // CORRIGIR VALOR LIVRE
  if (u.stage === "corrigir_valor" && text) {
    if (u.corrigirCampo) { u[u.corrigirCampo] = text.trim(); u.corrigirCampo = null }
    u.stage = "confirmacao"
    iniciarTimer(from)
    return tela_confirmacao(u)
  }

  // CORRIGIR UF
  if (u.stage === "corrigir_uf") {
    if (REGIOES[text]) { u._regiao = text; iniciarTimer(from); return telaUFsRegiao(text) }
    const val = UF_MAP[text]
    if (val) { u.uf = val; u.stage = "confirmacao"; iniciarTimer(from); return tela_confirmacao(u) }
    iniciarTimer(from)
    return telaRegioes()
  }

  // CORRIGIR CONTRIBUICAO/BOLSA FAMILIA
  if (u.stage === "corrigir_sel") {
    const mc = { cc_nunca: "Nunca", cc_pouco: "Pouco tempo", cc_1ano: "Mais de 1 ano", cc_muito: "Muitos anos" }
    const mb = { cb_sim: "Sim", cb_nao: "Nao" }
    const val = mc[text] || mb[text]
    if (val && u.corrigirCampo) { u[u.corrigirCampo] = val; u.corrigirCampo = null; u.stage = "confirmacao"; iniciarTimer(from); return tela_confirmacao(u) }
  }

  // CONFIRMACAO
  if (u.stage === "confirmacao") {
    if (text === "conf_ok") {
      const numeroCaso = await finalizarCadastro(from, u)
      const docs = getDocumentos(u.area, u.tipo || u.situacao)
      iniciarTimer(from)
      return {
        texto: `ðŸŽ‰ *Cadastro realizado com sucesso!*\n\nðŸ“„ *NÃºmero do caso:* \`${numeroCaso}\`\n\nUm especialista em *${u.area}* vai analisar sua solicitaÃ§Ã£o e entrarÃ¡ em contato em breve pelo WhatsApp. ðŸ’¬\n\nâ±ï¸ Prazo estimado: *2 dias Ãºteis*\n\n---\nðŸ“‹ *Documentos que podem ser necessÃ¡rios:*\n${docs}\n\nVocÃª pode enviar agora ou depois â€” fica Ã  vontade!`,
        opcoes: [{ id: "m_docs", title: "📎 Enviar docs" }, { id: "m_inicio", title: "🏠 Menu" }, { id: "m_encerrar", title: "👋 Encerrar" }]
      }
    }
    if (text === "conf_corrigir") {
      u.stage = "menu_correcao"; iniciarTimer(from)
      return {
        texto: "âœï¸ Qual informaÃ§Ã£o deseja corrigir?",
        opcoes: [
          { id: "cor_nome",    title: "ðŸ‘¤ Nome" },
          { id: "cor_cidade",  title: "ðŸ“ Cidade" },
          { id: "cor_uf",      title: "ðŸ—ºï¸ Estado" },
          { id: "cor_contrib", title: "ðŸ’¼ ContribuiÃ§Ã£o INSS" },
          { id: "cor_benef",   title: "ðŸ’³ Bolsa FamÃ­lia" },
          { id: "cor_desc",    title: "ðŸ’¬ DescriÃ§Ã£o" }
        ]
      }
    }
  }

  // MENU CORRECAO
  if (u.stage === "menu_correcao") {
    if (text === "cor_nome")   { u.corrigirCampo = "nome";   u.stage = "corrigir_valor"; iniciarTimer(from); return { texto: "Digite o nome correto:", opcoes: null } }
    if (text === "cor_cidade") { u.corrigirCampo = "cidade"; u.stage = "corrigir_valor"; iniciarTimer(from); return { texto: "Digite a cidade correta:", opcoes: null } }
    if (text === "cor_uf")     { u.stage = "corrigir_uf"; iniciarTimer(from); return telaRegioes() }
    if (text === "cor_desc")   { u.corrigirCampo = "descricao"; u.stage = "corrigir_valor"; iniciarTimer(from); return { texto: "Digite a descricao correta:", opcoes: null } }
    if (text === "cor_contrib") {
      u.corrigirCampo = "contribuicao"; u.stage = "corrigir_sel"; iniciarTimer(from)
      return { texto: "Corrija a informacao sobre contribuicao ao INSS:", opcoes: [{ id: "cc_nunca", title: "Nunca" }, { id: "cc_pouco", title: "Pouco tempo" }, { id: "cc_1ano", title: "Mais de 1 ano" }, { id: "cc_muito", title: "Muitos anos" }] }
    }
    if (text === "cor_benef") {
      u.corrigirCampo = "recebeBolsaFamilia"; u.stage = "corrigir_sel"; iniciarTimer(from)
      return { texto: "Voce recebe Bolsa Familia?", opcoes: [{ id: "cb_sim", title: "Sim" }, { id: "cb_nao", title: "Nao" }] }
    }
  }

  // NOVO CASO CONFIRMA â€” verificar se o telefone Ã© do cliente
  if (u.stage === "novo_caso_confirma") {
    if (text === "nc_meu") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = true
      u.whatsappContato = from.replace(/\D/g, "")
      u.stage = "area"; iniciarTimer(from)
      return {
        texto: `Ã“timo! Vamos abrir um novo caso. ðŸ˜Š\n\nQual Ã¡rea precisa de ajuda?`,
        opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalho" }, { id: "area_outros", title: "📋 Outros" }]
      }
    }
    if (text === "nc_outro") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      u.nome = null; u.regiao = null; u.cidade = null; u.uf = null
      u.stage = "coleta_tel_outro"; iniciarTimer(from)
      return { texto: "👤 Tudo bem! Qual é o WhatsApp com DDD da pessoa que será atendida?", opcoes: null }
    }
  }
  if (u.stage === "coleta_tel_outro" && text) {
    u.whatsappContato = text.replace(/\D/g, ""); u.stage = "coleta_tel_wpp"; iniciarTimer(from)
    return { texto: "🪪 Agora me diga o *nome completo* da pessoa que será atendida.", opcoes: null }
  }
  if (u.stage === "coleta_tel_wpp" && text) {
    u.nome = formatarNome(text.trim()); u.stage = "area"; iniciarTimer(from)
    return {
      texto: `Anotado! ðŸ‘\n\nAgora, qual Ã¡rea precisa de ajuda para *${u.nome}*?`,
      opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalho" }, { id: "area_outros", title: "📋 Outros" }]
    }
  }

  // COLETA
  if (u.stage === "coleta_nome" && text) {
    u.nome = formatarNome(text.trim()); u.stage = "coleta_regiao"; iniciarTimer(from)
    return telaRegioes()
  }
  if (u.stage === "coleta_regiao") {
    if (!REGIOES[text]) { iniciarTimer(from); return telaRegioes() }
    u._regiao = text; u.regiao = REGIOES[text].label; u.stage = "coleta_uf"; iniciarTimer(from)
    return telaUFsRegiao(text)
  }
  if (u.stage === "coleta_uf") {
    const val = UF_MAP[text]
    if (!val) { iniciarTimer(from); return telaUFsRegiao(u._regiao || "reg_n") }
    u.uf = val; u.stage = "coleta_cidade_regiao"; iniciarTimer(from)
    return { texto: "Digite a cidade onde vocÃª mora", opcoes: null }
  }
  if (u.stage === "coleta_cidade_regiao" && text) {
    u.cidade = formatarCidade(text.trim()); u.stage = "coleta_contrib_regiao_v2"; iniciarTimer(from)
    return { texto: "Voce ja contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"Nunca" }, { id:"col_c2", title:"Pouco tempo" }, { id:"col_c3", title:"Mais de 1 ano" }, { id:"col_c4", title:"Muitos anos" }] }
  }
  if (u.stage === "coleta_contrib_regiao_v2") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; u.stage = "coleta_cras"; iniciarTimer(from)
    return { texto: "ðŸ˜ï¸ Voce possui cadastro no CRAS?", opcoes: [{ id: "cras_sim", title: "âœ… Sim" }, { id: "cras_nao", title: "âŒ Nao" }] }
  }
  if (u.stage === "__coleta_benef_regiao_v2__") {
    const m = { col_b1: "Sim", col_b2: "Nao" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: [{ id: "col_b1", title: "Sim" }, { id: "col_b2", title: "Nao" }] } }
    u.recebeBolsaFamilia = m[text]; u.stage = "coleta_desc"; iniciarTimer(from)
    u.stage = "coleta_desc_audio"; iniciarTimer(from)
    return { texto: "ðŸ“ *Me explique o que esta acontecendo.*\n\nQuanto mais detalhes, melhor! ðŸ˜Š\n\nðŸŽ™ï¸ Pode *digitar* ou *enviar um audio* â€” escolha como preferir.\n\nðŸ’¡ Se for audio, fique a vontade para explicar com calma. Tenho todo o tempo do mundo!", opcoes: null }
  }
  if (u.stage === "coleta_contrib_regiao") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; u.stage = "coleta_cras"; iniciarTimer(from)
    return { texto: "ðŸ˜ï¸ Voce possui cadastro no CRAS?", opcoes: [{ id: "cras_sim", title: "âœ… Sim" }, { id: "cras_nao", title: "âŒ Nao" }] }
    return { texto: "ðŸ˜ï¸ Voce possui cadastro no CRAS?", opcoes: [{ id: "cras_sim", title: "âœ… Sim" }, { id: "cras_nao", title: "âŒ Nao" }] }
    return { texto: "Ã°Å¸ÂÂ¥ VocÃƒÂª jÃƒÂ¡ recebe algum benefÃƒÂ­cio do INSS?", opcoes: [{ id: "col_b1", title: "Ã¢Å“â€¦ Sim, recebo" }, { id: "col_b2", title: "Ã¢ÂÅ’ NÃƒÂ£o recebo" }] }
  }
  if (u.stage === "coleta_cidade" && text) {
    u.cidade = formatarCidade(text.trim()); u.stage = "coleta_contrib"; iniciarTimer(from)
    return { texto: "Ã°Å¸â€™Â¼ VocÃƒÂª jÃƒÂ¡ contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"Ã¢ÂÅ’ Nunca" }, { id:"col_c2", title:"Ã¢ÂÂ° Pouco tempo" }, { id:"col_c3", title:"Ã°Å¸â€œâ€¦ Mais de 1 ano" }, { id:"col_c4", title:"Ã°Å¸Ââ€  Muitos anos" }] }
  }
  if (u.stage === "__coleta_nome_legado__" && text) {
    u.nome = formatarNome(text.trim()); u.stage = "coleta_regiao"; iniciarTimer(from)
    return { texto: "ðŸ“ Em qual *cidade* vocÃª mora?", opcoes: null }
  }
  if (u.stage === "__coleta_cidade_legado__" && text) {
    u.cidade = formatarCidade(text.trim()); u.stage = "coleta_regiao"; iniciarTimer(from)
    return telaRegioes()
  }
  if (u.stage === "__coleta_regiao_legado__") {
    if (!REGIOES[text]) { iniciarTimer(from); return telaRegioes() }
    u._regiao = text; u.stage = "coleta_uf"; iniciarTimer(from)
    return telaUFsRegiao(text)
  }
  if (u.stage === "__coleta_uf_legado__") {
    const val = UF_MAP[text]
    if (!val) { iniciarTimer(from); return telaUFsRegiao(u._regiao || "reg_n") }
    u.uf = val; u.stage = "coleta_contrib"; iniciarTimer(from)
    return { texto: "ðŸ’¼ VocÃª jÃ¡ contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"âŒ Nunca" }, { id:"col_c2", title:"â° Pouco tempo" }, { id:"col_c3", title:"ðŸ“… Mais de 1 ano" }, { id:"col_c4", title:"ðŸ† Muitos anos" }] }
  }
  if (u.stage === "coleta_contrib") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; u.stage = "coleta_cras"; iniciarTimer(from)
    return { texto: "Voce possui cadastro no CRAS?", opcoes: [{ id: "cras_sim", title: "Sim" }, { id: "cras_nao", title: "Nao" }] }
    return { texto: "ðŸ¥ VocÃª jÃ¡ recebe algum benefÃ­cio do INSS?", opcoes: [{ id: "col_b1", title: "âœ… Sim, recebo" }, { id: "col_b2", title: "âŒ NÃ£o recebo" }] }
  }
  if (u.stage === "coleta_cras") {
    const m = { cras_sim: "Sim", cras_nao: "Nao" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: [{ id: "cras_sim", title: "âœ… Sim" }, { id: "cras_nao", title: "âŒ Nao" }] } }
    u.cadastroCRAS = m[text]
    if (text === "cras_sim") {
      u.stage = "coleta_cras_qtd"; iniciarTimer(from)
      return { texto: "ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦ Quantas pessoas fazem parte do cadastro?", opcoes: null }
    }
    u.qtdPessoasCRAS = null
    u.membrosFamiliaCRAS = null
    u.familiaCarteiraAssinada = null
    u.stage = "coleta_benef"; iniciarTimer(from)
    return { texto: "ðŸ’³ Voce recebe Bolsa Familia?", opcoes: [{ id: "col_b1", title: "âœ… Sim" }, { id: "col_b2", title: "âŒ Nao" }] }
  }
  if (u.stage === "coleta_cras_qtd" && text) {
    u.qtdPessoasCRAS = text.trim()
    u.stage = "coleta_cras_membros"; iniciarTimer(from)
    return { texto: "ðŸ§¾ Quais sao os membros da familia?", opcoes: null }
  }
  if (u.stage === "coleta_cras_membros" && text) {
    u.membrosFamiliaCRAS = text.trim()
    u.stage = "coleta_cras_carteira"; iniciarTimer(from)
    return { texto: "ðŸ’¼ Algum desses membros trabalha com carteira assinada?", opcoes: [{ id: "cras_ct_sim", title: "âœ… Sim" }, { id: "cras_ct_nao", title: "âŒ Nao" }] }
  }
  if (u.stage === "coleta_cras_carteira") {
    const m = { cras_ct_sim: "Sim", cras_ct_nao: "Nao" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: [{ id: "cras_ct_sim", title: "âœ… Sim" }, { id: "cras_ct_nao", title: "âŒ Nao" }] } }
    u.familiaCarteiraAssinada = m[text]
    u.stage = "coleta_benef"; iniciarTimer(from)
    return { texto: "ðŸ’³ Voce recebe Bolsa Familia?", opcoes: [{ id: "col_b1", title: "âœ… Sim" }, { id: "col_b2", title: "âŒ Nao" }] }
  }
  if (u.stage === "coleta_benef") {
    const m = { col_b1: "Sim", col_b2: "Nao" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: [{ id: "col_b1", title: "âœ… Sim" }, { id: "col_b2", title: "âŒ Nao" }] } }
    u.recebeBolsaFamilia = m[text]; u.stage = "coleta_desc"; iniciarTimer(from)
    u.stage = "coleta_desc_audio"; iniciarTimer(from)
    return { texto: "ðŸ“ *Me explique o que estÃ¡ acontecendo.*\n\nQuanto mais detalhes, melhor! ðŸ˜Š\n\nðŸŽ™ï¸ Pode *digitar* ou *enviar um Ã¡udio* â€” escolha como preferir.\n\nðŸ’¡ Se for Ã¡udio, fique Ã  vontade para explicar com calma. Tenho todo o tempo do mundo!", opcoes: null }
  }
  if ((u.stage === "coleta_desc" || u.stage === "coleta_desc_audio") && text) {
    // Salva temporariamente e mostra para o cliente confirmar
    u._descTemp = text.trim()
    u.stage = "desc_confirma"; iniciarTimer(from)
    const preview = text.length > 400 ? text.slice(0, 400) + "..." : text
    return {
      texto: `ðŸ“ *VocÃª descreveu:*

"${preview}"

EstÃ¡ correto?`,
      opcoes: [
        { id: "desc_ok",      title: "âœ… Confirmar" },
        { id: "desc_corrigir", title: "âœï¸ Corrigir" }
      ]
    }
  }

  // DESC_CONFIRMA â€” confirmar ou voltar para descriÃ§Ã£o
  if (u.stage === "desc_confirma") {
    if (text === "desc_corrigir") {
      u._descTemp = null
      u.stage = "coleta_desc_audio"; iniciarTimer(from)
      return {
        texto: "ðŸ“ *Me explique o que estÃ¡ acontecendo.*\n\nQuanto mais detalhes, melhor! ðŸ˜Š\n\nðŸŽ™ï¸ Pode *digitar* ou *enviar um Ã¡udio* â€” escolha como preferir.\n\nðŸ’¡ Se for Ã¡udio, fique Ã  vontade para explicar com calma. Tenho todo o tempo do mundo!",
        opcoes: null
      }
    }
    // desc_ok ou qualquer confirmaÃ§Ã£o
    u.descricao = formatarNome((u._descTemp || "").trim())
    u._descTemp  = null
    u.stage = "confirmacao"; iniciarTimer(from)
    return tela_confirmacao(u)
  }

  // GATILHO â†’ URGENCIA â†’ COLETA
  if (u.stage === "gatilho") {
    u.stage = "urgencia"; iniciarTimer(from)
    return { texto: "ðŸ’° Isso estÃ¡ te prejudicando *financeiramente* hoje?", opcoes: [{ id: "urg_sim", title: "âš ï¸ Sim, estÃ¡" }, { id: "urg_nao", title: "âœ… NÃ£o, consigo esperar" }] }
  }
  if (u.stage === "urgencia") {
    if (text === "urg_sim") { u.urgencia = "alta"; u.score += 3 }
    if (u.whatsappVerificado) {
      u.stage = "coleta_nome"; iniciarTimer(from)
      return { texto: u.telefoneEhDoCliente ? "âœï¸ Qual Ã© o seu *nome completo*?" : "âœï¸ Qual Ã© o *nome completo* da pessoa que serÃ¡ atendida?", opcoes: null }
    }
    u.stage = "coleta_verif_tel"; iniciarTimer(from)
    return telaPerguntaWhatsApp(from)
  }
  if (u.stage === "coleta_verif_tel") {
    if (text === "tel_outro") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      u.stage = "coleta_tel_wpp_contato"; iniciarTimer(from)
      return { texto: "ðŸ‘¤ Certo! Qual Ã© o WhatsApp com DDD da pessoa que serÃ¡ atendida?", opcoes: null }
    }
    // tel_meu ou qualquer outra resposta â€” segue normalmente
    u.whatsappVerificado = true
    u.telefoneEhDoCliente = true
    u.whatsappContato = from.replace(/\D/g, "")
    u.stage = "coleta_nome"; iniciarTimer(from)
    return { texto: "âœï¸ Qual Ã© o seu *nome completo*?", opcoes: null }
  }
  if (u.stage === "coleta_tel_wpp_contato" && text) {
    u.whatsappContato = text.replace(/\D/g, ""); u.stage = "coleta_nome"; iniciarTimer(from)
    return { texto: "ðŸªª Agora me diga o *nome completo* da pessoa que serÃ¡ atendida.", opcoes: null }
  }

  // INICIO
  if (u.stage === "inicio") {
    if (u.numeroCaso) {
      // Cliente retornando â€” perguntar se quer acompanhar ou abrir novo caso
      u.stage = "inicio_retorno"; iniciarTimer(from)
      const partes = (u.nome || u.nomeWA).split(" ")
      const nomeExib = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0]
      return {
        texto: `ðŸ‘‹ OlÃ¡, ${nomeExib}! Que bom te ver por aqui novamente!\n\nVocÃª jÃ¡ possui um atendimento conosco.\n\nðŸ“„ Caso: *${u.numeroCaso}*\nâš–ï¸ Ãrea: ${u.area}\n\nO que deseja fazer?`,
        opcoes: [
          { id: "ret_acompanhar", title: "ðŸ“Š Acompanhar meu caso" },
          { id: "ret_novo",       title: "âž• Abrir novo caso" }
        ]
      }
    }
    u.stage = "area"; iniciarTimer(from)
    return {
      texto: "âš–ï¸ Bem-vindo Ã  *Oraculum Advocacia*!\n\nMe chamo *Beatriz*, sou sua assistente virtual ðŸ˜Š\n\nComo posso te ajudar hoje?",
      opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalho" }, { id: "area_outros", title: "📋 Outros" }]
    }
  }

  // RETORNO â€” cliente escolhe entre acompanhar ou novo caso
  if (u.stage === "inicio_retorno") {
    if (text === "ret_acompanhar") {
      u.stage = "cliente"; iniciarTimer(from)
      return menuCliente(u)
    }
    if (text === "ret_novo") {
      // Preserva dados do cliente (nome, cidade, contato) mas reinicia o fluxo do caso
      const dadosPessoais = { nome: u.nome, regiao: u.regiao, cidade: u.cidade, uf: u.uf, nomeWA: u.nomeWA, contatoId: u.contatoId }
      users[from] = { ...novoUsuario(u.nomeWA), ...dadosPessoais, stage: "area" }
      iniciarTimer(from)
      return {
        texto: `ðŸ“‹ Certo, ${u.nome ? u.nome.split(" ")[0] : u.nomeWA}! Vamos abrir um novo caso.\n\nQual Ã¡rea precisa de ajuda?`,
        opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalho" }, { id: "area_outros", title: "📋 Outros" }]
      }
    }
  }

  // AREA
  if (u.stage === "area") {
    if (text === "area_inss") { u.area = "INSS"; u.stage = "inss_menu"; iniciarTimer(from); return { texto: "âœ… Certo, vamos cuidar do seu caso!\nQual dessas situaÃ§Ãµes descreve o que estÃ¡ acontecendo?", opcoes: [{ id: "i_novo", title: "ðŸ†• Novo benefÃ­cio" }, { id: "i_negado", title: "âŒ BenefÃ­cio negado" }, { id: "i_cortado", title: "âœ‚ï¸ BenefÃ­cio cortado" }] } }
    if (text === "area_trab") { u.area = "Trabalhista"; u.stage = "trab_menu"; iniciarTimer(from); return { texto: "ðŸ’¼ Qual Ã© o seu caso trabalhista?", opcoes: [{ id: "t_dem", title: "ðŸ‘” Fui demitido" }, { id: "t_dir", title: "ðŸ’° Direitos nÃ£o pagos" }, { id: "t_acid", title: "ðŸš‘ Acidente de trabalho" }, { id: "t_ass", title: "ðŸ˜° AssÃ©dio moral" }, { id: "t_out", title: "ðŸ“‹ Outro" }] } }
    if (text === "area_outros") { u.area = "Outros"; u.stage = "outros_menu"; iniciarTimer(from); return { texto: "ðŸ“‹ Como posso te ajudar?", opcoes: [{ id: "o_consul", title: "âš–ï¸ Consultoria jurÃ­dica" }, { id: "o_rev", title: "ðŸ“„ RevisÃ£o de documentos" }, { id: "o_out", title: "ðŸ’¬ Outro assunto" }] } }
  }

  // INSS MENU
  if (u.stage === "inss_menu") {
    if (text === "i_novo")    { u.situacao = "novo";    u.stage = "inss_novo";    iniciarTimer(from); return { texto: "ðŸ¥ Qual benefÃ­cio vocÃª deseja solicitar?", opcoes: [{ id: "in_apos", title: "ðŸ‘´ Aposentadoria" }, { id: "in_bpc", title: "ðŸ¤ BPC / LOAS" }, { id: "in_incap", title: "ðŸ¥ Incapacidade" }, { id: "in_dep", title: "ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Dependentes" }, { id: "in_out", title: "ðŸ“‹ Outros" }] } }
    if (text === "i_negado")  { u.situacao = "negado";  u.score += 1; u.stage = "inss_neg_tipo"; iniciarTimer(from); return { texto: "âŒ Qual benefÃ­cio foi negado?", opcoes: [{ id: "ign_apos", title: "ðŸ‘´ Aposentadoria" }, { id: "ign_bpc", title: "ðŸ¤ BPC / LOAS" }, { id: "ign_incap", title: "ðŸ¥ Incapacidade" }, { id: "ign_dep", title: "ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Dependentes" }, { id: "ign_out", title: "ðŸ“‹ Outros" }] } }
    if (text === "i_cortado") { u.situacao = "cortado"; u.score += 2; u.stage = "inss_cort_tipo"; iniciarTimer(from); return { texto: "âœ‚ï¸ Qual benefÃ­cio foi cortado?", opcoes: [{ id: "ic_apos", title: "ðŸ‘´ Aposentadoria" }, { id: "ic_bpc", title: "ðŸ¤ BPC / LOAS" }, { id: "ic_incap", title: "ðŸ¥ Incapacidade" }, { id: "ic_dep", title: "ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Dependentes" }, { id: "ic_out", title: "ðŸ“‹ Outros" }] } }
  }

  // INSS NOVO
  if (u.stage === "inss_novo") {
    const m = { in_apos: "aposentadoria", in_bpc: "bpc", in_incap: "incapacidade", in_dep: "dependentes", in_out: "inss_outros" }
    u.tipo = m[text] || "outros"
    if (text === "in_apos") { u.stage = "inss_apos"; iniciarTimer(from); return { texto: "ðŸ‘´ Qual tipo de aposentadoria?", opcoes: [{ id: "ia_idade", title: "ðŸ“… Por idade" }, { id: "ia_tempo", title: "ðŸ“‹ Tempo contribuiÃ§Ã£o" }, { id: "ia_esp", title: "â­ Especial" }] } }
    if (text === "in_bpc")  { u.stage = "inss_bpc";  iniciarTimer(from); return { texto: "ðŸ¤ BPC/LOAS â€” Qual opÃ§Ã£o?", opcoes: [{ id: "ib_id", title: "ðŸ‘´ Idoso" }, { id: "ib_def", title: "â™¿ DeficiÃªncia" }] } }
    if (text === "in_incap"){ u.stage = "inss_inc";  iniciarTimer(from); return { texto: "ðŸ¥ Qual benefÃ­cio por incapacidade?", opcoes: [{ id: "ii_aux", title: "ðŸ©º AuxÃ­lio-doenÃ§a" }, { id: "ii_inv", title: "âš ï¸ Aposentadoria por invalidez" }] } }
    if (text === "in_dep")  { u.stage = "inss_dep";  iniciarTimer(from); return { texto: "ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Qual benefÃ­cio para dependentes?", opcoes: [{ id: "id_pen", title: "ðŸ•Šï¸ PensÃ£o por morte" }, { id: "id_rec", title: "ðŸ”’ AuxÃ­lio-reclusÃ£o" }, { id: "id_out", title: "ðŸ“‹ Outro" }] } }
    if (text === "in_out")  { u.stage = "inss_out";  iniciarTimer(from); return { texto: "ðŸ“‹ Qual opÃ§Ã£o?", opcoes: [{ id: "io_rev", title: "ðŸ”„ RevisÃ£o de benefÃ­cio" }, { id: "io_ctc", title: "ðŸ“œ CertidÃ£o de contribuiÃ§Ã£o" }, { id: "io_pla", title: "ðŸŽ¯ Planejamento" }] } }
  }

  // INSS subtipos â†’ INSS_JA
  if (["inss_apos","inss_bpc","inss_inc","inss_dep","inss_out"].includes(u.stage)) {
    const m = {
      ia_idade: "Por idade", ia_tempo: "Tempo de contribuicao", ia_esp: "Especial",
      ib_id: "Idoso", ib_def: "Pessoa com deficiencia",
      ii_aux: "Auxilio-doenca", ii_inv: "Aposentadoria por invalidez",
      id_pen: "Pensao por morte", id_rec: "Auxilio-reclusao", id_out: "Outro",
      io_rev: "Revisao de beneficio", io_ctc: "Certidao de tempo de contribuicao", io_pla: "Planejamento de aposentadoria"
    }
    u.subTipo = m[text] || text; u.stage = "inss_ja"; iniciarTimer(from)
    return { texto: "ðŸ“‹ VocÃª jÃ¡ deu entrada nesse pedido no INSS?", opcoes: [{ id:"ja_s", title:"Sim" }, { id:"ja_n", title:"NÃ£o" }] }
  }
  if (u.stage === "inss_ja") {
    u.detalhe = text === "ja_s" ? "Sim, jÃ¡ deu entrada no INSS" : "Ainda nÃ£o deu entrada"
    u.stage   = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’¡ Casos como o seu sÃ£o bem comuns aqui.\n\nMuitas vezes conseguimos resolver mais rÃ¡pido do que a pessoa imagina! ðŸ’ª", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }

  // INSS NEGADO
  if (u.stage === "inss_neg_tipo") {
    const m = { ign_apos: "Aposentadoria", ign_bpc: "BPC/LOAS", ign_incap: "Incapacidade", ign_dep: "Dependentes", ign_out: "Outros" }
    u.subTipo = m[text] || text; u.stage = "inss_neg_quando"; iniciarTimer(from)
    return { texto: "ðŸ“… Quando o benefÃ­cio foi negado?", opcoes: [{ id: "nq_rec", title: "ðŸ• Menos de 30 dias" }, { id: "nq_ant", title: "ðŸ“… Mais de 30 dias" }] }
  }
  if (u.stage === "inss_neg_quando") {
    u.detalhe = text === "nq_rec" ? "Negado ha menos de 30 dias" : "Negado ha mais de 30 dias"
    u.stage   = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ” Vamos analisar seu caso com muito cuidado!", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }

  // INSS CORTADO
  if (u.stage === "inss_cort_tipo") {
    const m = { ic_apos: "Aposentadoria", ic_bpc: "BPC/LOAS", ic_incap: "Incapacidade", ic_dep: "Dependentes", ic_out: "Outros" }
    u.subTipo = m[text] || text; u.stage = "inss_cort_mot"; iniciarTimer(from)
    return { texto: "â“ VocÃª sabe o motivo do corte?", opcoes: [{ id: "cm_n", title: "ðŸ¤· NÃ£o sei" }, { id: "cm_p", title: "ðŸ¥ Falta de perÃ­cia" }, { id: "cm_r", title: "ðŸ’° Renda acima" }, { id: "cm_o", title: "ðŸ“‹ Outro" }] }
  }
  if (u.stage === "inss_cort_mot") {
    const m = { cm_n: "Motivo desconhecido", cm_p: "Falta de pericia", cm_r: "Renda acima do permitido", cm_o: "Outro" }
    u.detalhe = m[text] || text; u.stage = "inss_cort_rec"; iniciarTimer(from)
    return { texto: "âš ï¸ VocÃª estÃ¡ sem receber agora?", opcoes: [{ id: "sr_s", title: "ðŸ”´ Sim, sem renda" }, { id: "sr_n", title: "ðŸŸ¡ Ainda recebo algo" }] }
  }
  if (u.stage === "inss_cort_rec") {
    if (text === "sr_s") { u.semReceber = true; u.urgencia = "alta"; u.score += 3 }
    u.stage = "inss_cort_qdo"; iniciarTimer(from)
    return { texto: "ðŸ“… Quando o benefÃ­cio foi cortado?", opcoes: [{ id: "cq_r", title: "ðŸ• Menos de 30 dias" }, { id: "cq_a", title: "ðŸ“… Mais de 30 dias" }] }
  }
  if (u.stage === "inss_cort_qdo") {
    u.detalhe += " | " + (text === "cq_r" ? "Cortado ha menos de 30 dias" : "Cortado ha mais de 30 dias")
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’ª Vamos verificar a melhor forma de resolver isso!", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }

  // TRABALHISTA
  if (u.stage === "trab_menu") {
    if (text === "t_dem")  { u.situacao = "Demissao";          u.tipo = "demissao";  u.stage = "trab_dem_tipo"; iniciarTimer(from); return { texto: "Como foi a demissÃ£o?", opcoes: [{ id: "td_s", title: "Sem justa causa" }, { id: "td_c", title: "Com justa causa" }, { id: "td_p", title: "Pedido de demissÃ£o" }] } }
    if (text === "t_dir")  { u.situacao = "Direitos nao pagos"; u.tipo = "direitos";  u.stage = "trab_dir_tipo"; iniciarTimer(from); return { texto: "ðŸ’° Qual direito nÃ£o foi pago?", opcoes: [{ id: "tdr_f", title: "ðŸ’¼ FGTS" }, { id: "tdr_fe", title: "ðŸ–ï¸ FÃ©rias" }, { id: "tdr_13", title: "ðŸŽ 13Âº salÃ¡rio" }, { id: "tdr_h", title: "â° Horas extras" }, { id: "tdr_o", title: "ðŸ“‹ Outro" }] } }
    if (text === "t_acid") { u.situacao = "Acidente de trabalho"; u.tipo = "acidente"; u.stage = "trab_acid_af"; iniciarTimer(from); return { texto: "ðŸ¥ VocÃª se afastou pelo INSS?", opcoes: [{ id: "af_s", title: "âœ… Sim" }, { id: "af_n", title: "âŒ NÃ£o" }] } }
    if (text === "t_ass")  { u.situacao = "Assedio moral";       u.tipo = "assedio";  u.stage = "trab_ass_s"; iniciarTimer(from); return { texto: "ðŸ˜° O assÃ©dio ainda estÃ¡ acontecendo?", opcoes: [{ id: "as_s", title: "âš ï¸ Sim, ainda acontece" }, { id: "as_n", title: "âœ… NÃ£o, jÃ¡ parou" }] } }
    if (text === "t_out")  { u.situacao = "Outros";              u.tipo = "outros";   u.stage = "trab_out_desc"; iniciarTimer(from); return { texto: "âœï¸ Descreva brevemente seu caso trabalhista:\n\nðŸ’¡ Pode digitar ou enviar um Ã¡udio.", opcoes: null } }
  }
  if (u.stage === "trab_dem_tipo") {
    const m = { td_s: "Sem justa causa", td_c: "Com justa causa", td_p: "Pedido de demissao" }
    u.subTipo = m[text] || text; u.stage = "trab_dem_verb"; iniciarTimer(from)
    return { texto: "ðŸ’µ VocÃª recebeu todas as verbas rescisÃ³rias?", opcoes: [{ id: "tv_s", title: "âœ… Sim, recebi" }, { id: "tv_n", title: "âŒ NÃ£o recebi" }] }
  }
  if (u.stage === "trab_dem_verb") {
    u.detalhe = text === "tv_s" ? "Verbas pagas" : "Verbas nao pagas"; u.stage = "trab_dem_qdo"; iniciarTimer(from)
    return { texto: "â° HÃ¡ quanto tempo foi a demissÃ£o?", opcoes: [{ id: "dq_r", title: "ðŸ• Menos de 30 dias" }, { id: "dq_a", title: "ðŸ“… Mais de 30 dias" }] }
  }
  if (u.stage === "trab_dem_qdo") {
    u.detalhe += " | " + (text === "dq_r" ? "menos de 30 dias" : "mais de 30 dias")
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’¡ Casos como o seu sÃ£o bem comuns aqui! ðŸ’ª", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }
  if (u.stage === "trab_dir_tipo") {
    const m = { tdr_f: "FGTS", tdr_fe: "Ferias", tdr_13: "13 salario", tdr_h: "Horas extras", tdr_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "trab_dir_pend"; iniciarTimer(from)
    return { texto: "â³ Isso ainda estÃ¡ pendente?", opcoes: [{ id: "pnd_s", title: "âš ï¸ Sim, pendente" }, { id: "pnd_n", title: "âœ… JÃ¡ encerrado" }] }
  }
  if (u.stage === "trab_dir_pend") {
    u.detalhe = text === "pnd_s" ? "Pendente" : "Encerrado"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’¡ Casos como o seu sÃ£o bem comuns aqui! ðŸ’ª", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }
  if (u.stage === "trab_acid_af") {
    u.subTipo = text === "af_s" ? "Com afastamento INSS" : "Sem afastamento"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’¡ Casos como o seu sÃ£o bem comuns aqui! ðŸ’ª", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }
  if (u.stage === "trab_ass_s") {
    u.subTipo = text === "as_s" ? "Assedio em curso" : "Assedio encerrado"; u.stage = "trab_ass_prov"; iniciarTimer(from)
    return { texto: "ðŸ“‚ VocÃª possui provas ou testemunhas?", opcoes: [{ id: "pv_s", title: "âœ… Sim, tenho provas" }, { id: "pv_n", title: "âŒ NÃ£o tenho" }] }
  }
  if (u.stage === "trab_ass_prov") {
    u.detalhe = text === "pv_s" ? "Com provas/testemunhas" : "Sem provas"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’¡ Casos como o seu sÃ£o bem comuns aqui! ðŸ’ª", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }
  if (u.stage === "trab_out_desc" && text) {
    if (!u.descricao) u.descricao = text
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "âœ… Certo! Vamos registrar seu caso.", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }

  // OUTROS
  if (u.stage === "outros_menu") {
    if (text === "o_consul") { u.situacao = "Consultoria juridica"; u.stage = "out_cons_tipo"; iniciarTimer(from); return { texto: "âš–ï¸ Sobre qual Ã¡rea precisa de orientaÃ§Ã£o?", opcoes: [{ id: "oc_i", title: "ðŸ¥ INSS" }, { id: "oc_t", title: "ðŸ’¼ Trabalhista" }, { id: "oc_o", title: "ðŸ“‹ Outra Ã¡rea" }] } }
    if (text === "o_rev")    { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.stage = "out_rev_tipo"; iniciarTimer(from); return { texto: "ðŸ“„ Qual tipo de documento para revisÃ£o?", opcoes: [{ id: "or_c", title: "ðŸ“ Contrato" }, { id: "or_p", title: "âš–ï¸ Processo" }, { id: "or_o", title: "ðŸ“‹ Outro" }] } }
    if (text === "o_out")    { u.situacao = "Outro assunto"; u.stage = "out_desc"; iniciarTimer(from); return { texto: "ðŸ’¬ Descreva brevemente o que precisa:\n\nðŸ’¡ Pode digitar ou enviar um Ã¡udio.", opcoes: null } }
  }
  if (u.stage === "out_cons_tipo") {
    const m = { oc_i: "INSS", oc_t: "Trabalhista", oc_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’¡ Casos como o seu sÃ£o bem comuns aqui! ðŸ’ª", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }
  if (u.stage === "out_rev_tipo") {
    const m = { or_c: "Contrato", or_p: "Processo", or_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "ðŸ’¡ Casos como o seu sÃ£o bem comuns aqui! ðŸ’ª", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }
  if (u.stage === "out_desc" && text) {
    if (!u.descricao) u.descricao = text
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "âœ… Certo! Vamos registrar seu caso.", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
  }

  // MENU CLIENTE
  if (u.stage === "cliente") {
    if (text === "m_status") {
      iniciarTimer(from)
      const stLbl  = u.urgencia === "alta" ? "âš¡ AnÃ¡lise prioritÃ¡ria" : "ðŸ” Em anÃ¡lise"
      const totD   = getDocumentosLista(u.area, u.tipo || u.situacao).length
      const entD   = (u.docsEntregues || []).length
      const dInfo  = entD >= totD ? "\nâœ… Documentos: todos entregues" : `\nðŸ“‹ Documentos: ${entD} de ${totD} entregues`
      const sitStr = u.situacao ? `${u.situacao}${u.subTipo ? " â€” " + u.subTipo : ""}` : "â€”"
      const txt = [
        "ðŸ“Š *Status do seu caso*","",
        `ðŸ”¢ NÃºmero: *${u.numeroCaso}*`,
        `âš–ï¸ Ãrea: ${u.area}`,
        `ðŸ“‹ SituaÃ§Ã£o: ${sitStr}`,
        `ðŸš¦ Status: ${stLbl}`,
        `${u.urgencia==="alta"?"ðŸ”´":"ðŸŸ¡"} Prioridade: ${u.urgencia==="alta"?"Alta":"Normal"}`,
        dInfo,"",
        "Nossa equipe estÃ¡ avaliando seu caso com atenÃ§Ã£o. Assim que houver novidades, entraremos em contato pelo WhatsApp. ðŸ’¬","",
        "â±ï¸ Prazo estimado: atÃ© *2 dias Ãºteis*."
      ].join("\n")
      return { texto: txt, opcoes: [{ id:"m_docs", title:"📎 Enviar docs" }, { id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }
    if (text === "doc_cpf_skip") {
      // Pular CPF â€” jÃ¡ estÃ¡ no RG
      if (!u.docsEntregues) u.docsEntregues = []
      u.docsEntregues.push("doc_cpf")
      u.docAtualIdx = 0
      u.ultimoArqId = null
      const telaCpf = telaEnvioDoc(u)
      iniciarTimer(from)
      return telaCpf
    }
    if (text === "m_docs") {
      await hsMoverStage(u.negocioId, HS_STAGE.docs)
      if (!u.docsEntregues) u.docsEntregues = []
      u.docAtualIdx = u.docAtualIdx || 0
      const tela = telaEnvioDoc(u)
      iniciarTimer(from)
      return tela
    }
    if (text === "docs_reenviar") {
      if (u.ultimoArqId) {
        await excluirDrive(u.ultimoArqId)
        u.ultimoArqId = null; u.ultimoArqNome = null
        u.docAtualIdx = Math.max(0, (u.docAtualIdx || 1) - 1)
      }
      const pend2 = getDocsPendentes(u)
      const d2    = pend2[0]
      const f2    = (d2?.folhas || ["Foto"])[u.docAtualIdx || 0] || "Foto"
      iniciarTimer(from)
      return { texto: `ðŸ”„ Foto anterior removida!\n\nEnvie novamente: *${f2}* do *${d2?.label || "documento"}*\n\nðŸ’¡ Boa iluminaÃ§Ã£o, sem reflexo, tudo enquadrado.`, opcoes: null }
    }
    if (text === "docs_maisFotos") {
      // NÃ£o avanÃ§a para o prÃ³ximo documento â€” permanece no atual
      const pend3  = getDocsPendentes(u)
      const d3     = pend3[0]
      const fAtual = (d3?.folhas || ["Foto"])[u.docAtualIdx || 0] || `Foto ${(u.docAtualIdx||0)+1}`
      iniciarTimer(from)
      return { texto: `ðŸ“¸ Ok! Envie mais uma foto de *${d3?.label || "documento"}*\n\nFoto atual: *${fAtual}*\n\nðŸ’¡ Mesmas orientaÃ§Ãµes: boa iluminaÃ§Ã£o, sem reflexo, enquadrado corretamente.`, opcoes: null }
    }
    if (text === "docs_proxdoc") {
      const pend4 = getDocsPendentes(u)
      if (pend4.length > 0) u.docsEntregues.push(pend4[0].id)
      u.docAtualIdx = 0
      u.ultimoArqId = null
      const tela4 = telaEnvioDoc(u)
      iniciarTimer(from)
      return tela4
    }
    if (text === "docs_depois") {
      const nome1 = (u.nome || u.nomeWA).split(" ")[0]
      iniciarTimer(from)
      return { texto: `Sem problema, ${nome1}! 😊\n\nQuando tiver os documentos, é só voltar aqui e tocar em *"Enviar documentos"*.\n\n📁 Caso: *${u.numeroCaso}*`, opcoes: [{ id:"m_docs", title:"📎 Enviar docs" }, { id:"m_status", title:"📊 Status" }, { id:"m_inicio", title:"🏠 Menu" }] }
    }
    if (text === "m_adv") {
      iniciarTimer(from)
      return { texto: "👨‍⚖️ *Falar com advogado*\n\nComo prefere ser atendido?", opcoes: [{ id: "adv_ag", title: "📅 Agendar" }, { id: "adv_urg", title: "⚠️ Urgente" }, { id: "m_inicio", title: "🏠 Menu" }] }
    }
    if (text === "adv_ag") {
      await hsMoverStage(u.negocioId, HS_STAGE.agendamento)
      await hsCriarNota(u.contatoId, "AGENDAMENTO SOLICITADO", `${u.nome} (${from}) solicitou agendamento.\nCaso: ${u.numeroCaso} | Ãrea: ${u.area}\nLink: ${MEETINGS}`)
      iniciarTimer(from)
      return {
        texto: `ðŸ“… *Agendar ligaÃ§Ã£o com advogado*\n\nClique no link abaixo para escolher o melhor horÃ¡rio:\n\nðŸ”— ${MEETINGS}\n\nâœ… ApÃ³s agendar, vocÃª receberÃ¡ uma *confirmaÃ§Ã£o aqui no WhatsApp* com data e horÃ¡rio.\n\nðŸ’¡ Dica: Escolha um horÃ¡rio em que vocÃª esteja disponÃ­vel para receber a ligaÃ§Ã£o.\n\nðŸ“„ Caso: *${u.numeroCaso}*`,
        opcoes: [
          { id: "adv_urg",  title: "📩 Urgente" },
          { id: "m_status", title: "📊 Status" },
          { id: "m_inicio", title: "🏠 Menu" }
        ]
      }
    }
    if (text === "adv_urg") {
      u.stage = "aguardando_urgente"; iniciarTimer(from)
      return { texto: `ðŸ“© *Mensagem urgente*\n\nDigite sua mensagem ou envie um Ã¡udio agora.\n\nTudo serÃ¡ registrado imediatamente e um advogado serÃ¡ notificado. âš¡\n\nðŸ“„ Caso: *${u.numeroCaso}*`, opcoes: null }
    }
    if (text === "m_novocaso") {
      // Preserva dados pessoais e contatoId, reinicia fluxo do caso
      const snap = {
        nome: u.nome, regiao: u.regiao, cidade: u.cidade, uf: u.uf, nomeWA: u.nomeWA, contatoId: u.contatoId,
        whatsappVerificado: u.whatsappVerificado, telefoneEhDoCliente: u.telefoneEhDoCliente, whatsappContato: u.whatsappContato
      }
      users[from] = { ...novoUsuario(u.nomeWA), ...snap, stage: u.whatsappVerificado ? "area" : "novo_caso_confirma" }
      iniciarTimer(from)
      if (snap.whatsappVerificado) {
        return {
          texto: `âž• *Abrir novo caso*\n\nVou continuar com os dados jÃ¡ confirmados:\n\nðŸ‘¤ ${snap.nome}\nðŸ“ ${snap.cidade}${snap.uf ? " - " + snap.uf : ""}\n\nQual Ã¡rea precisa de ajuda agora?`,
          opcoes: [
            { id: "area_inss", title: "ðŸ¥ INSS" },
            { id: "area_trab", title: "ðŸ’¼ Trabalho" },
            { id: "area_outros", title: "ðŸ“‹ Outros" }
          ]
        }
      }
      return {
        texto: `âž• *Abrir novo caso*\n\nVou usar seus dados cadastrados:\n\nðŸ‘¤ ${snap.nome}\nðŸ“ ${snap.cidade}${snap.uf ? " - " + snap.uf : ""}\n\nAntes de seguir, preciso confirmar o WhatsApp deste atendimento.`,
        opcoes: [
          { id: "nc_meu",    title: "âœ… Sim, Ã© meu" },
          { id: "nc_outro",  title: "ðŸ‘¤ Outra pessoa" }
        ]
      }
    }
    if (text === "m_encerrar") {
      limparTimer(u)
      const nome1 = (u.nome || u.nomeWA).split(" ")[0]
      return { texto: `Foi um prazer te atender, ${nome1}! ðŸ˜Š\n\nSeu caso estÃ¡ registrado sob o nÃºmero *${u.numeroCaso}*.\n\nSempre que precisar, Ã© sÃ³ mandar uma mensagem. AtÃ© logo! ðŸ‘‹`, opcoes: null }
    }
    if (text === "m_inicio") {
      iniciarTimer(from); return menuCliente(u)
    }
    // Detectar intencao de encerrar antes de passar para IA
    if (text) {
      const palavrasEncerrar = ["encerrar","encerra","tchau","ate logo","boa noite","boa tarde","bom dia","obrigado","obrigada","ate mais","pode encerrar","finalizar","finalize","fecha","fechar","ate breve","por hoje"]
      if (palavrasEncerrar.some(p => lower.includes(p))) {
        const nome1 = (u.nome || u.nomeWA).split(" ")[0]
        limparTimer(u)
        return { texto: `Foi um prazer, ${nome1}! Seu caso ${u.numeroCaso} esta registrado.\n\nQualquer coisa, e so mandar mensagem. Ate logo!`, opcoes: null }
      }
    }
    // Groq IA para perguntas livres
    if (text && GROQ_KEY) {
      const resp = await respostaIA(u, text)
      if (resp) { iniciarTimer(from); return { texto: resp, opcoes: [{ id:"m_status", title:"📊 Status" }, { id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_encerrar", title:"👋 Encerrar" }, { id:"m_inicio", title:"🏠 Menu" }] } }
    }
    iniciarTimer(from); return menuCliente(u)
  }

  // FALLBACK
  u.stage = "area"; iniciarTimer(from)
  return { texto: "🔄 Vamos recomeçar. Como posso te ajudar?", opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalho" }, { id: "area_outros", title: "📋 Outros" }] }
}


app.get("/", (_, res) => res.send("Oraculum v6.2.1"))
app.get("/health", (_, res) => res.json({ status: "ok", uptime: Math.floor((Date.now() - monitor.inicio) / 1000), conversas: monitor.conversas, cadastros: monitor.cadastros, ativos: Object.keys(users).length, erros: monitor.erros.slice(-10), ram_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) }))
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] && req.query["hub.verify_token"] === VERIFY_TOKEN) return res.status(200).send(req.query["hub.challenge"])
  return res.sendStatus(403)
})
app.post("/webhook", async (req, res) => {
  try {
    const value   = req.body.entry?.[0]?.changes?.[0]?.value
    const message = value?.messages?.[0]
    if (!message) return res.sendStatus(200)
    const from   = message.from
    const nomeWA = value?.contacts?.[0]?.profile?.name || "Cliente"
    const text   = (message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "").trim()
    const { texto, opcoes } = await processar(from, nomeWA, text, message)
    if (texto) await enviar(from, texto, opcoes)
    return res.sendStatus(200)
  } catch (err) { logErro("geral", err.message); return res.sendStatus(500) }
})

const PORT = process.env.PORT || 10000
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ROTA /agendamento â€” confirmaÃ§Ã£o de ligaÃ§Ã£o agendada
// Como usar GRATUITAMENTE (sem pagar HubSpot):
//   OpÃ§Ã£o 1: Make.com (gratuito, 1000 ops/mÃªs):
//     - Crie cenÃ¡rio: HubSpot "Meeting Booked" â†’ HTTP POST â†’ https://seu-dominio.onrender.com/agendamento
//     - Body: { "phone": "{{contact.phone}}", "name": "{{contact.firstname}}", "datetime": "{{meeting.startTime}}", "meetingLink": "{{meeting.joinUrl}}" }
//   OpÃ§Ã£o 2: n8n (auto-hospedado, 100% gratuito):
//     - Trigger HubSpot â†’ HTTP Request para esta rota
//   OpÃ§Ã£o 3: Zapier free tier (100 tarefas/mÃªs)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post("/agendamento", async (req, res) => {
  try {
    const { phone, name, datetime, meetingLink, caseid } = req.body
    if (!phone) return res.sendStatus(400)
    const numero = phone.replace(/\D/g, "")
    const nomeCliente = name || "cliente"
    const dataHora    = datetime || "em breve"
    const linkReag    = meetingLink || MEETINGS

    // Formatar data se vier em ISO
    let dataFormatada = dataHora
    try {
      if (dataHora.includes("T")) {
        const d = new Date(dataHora)
        dataFormatada = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
      }
    } catch {}

    const msg = [
      "ðŸ“… *Agendamento confirmado!*",
      "",
      `âœ… OlÃ¡, *${nomeCliente}*! Sua ligaÃ§Ã£o com um especialista da Oraculum estÃ¡ confirmada.`,
      "",
      `ðŸ—“ï¸ *Data e horÃ¡rio:* ${dataFormatada}`,
      "",
      "ðŸ“ž Nosso advogado vai te ligar no nÃºmero cadastrado. Deixe o celular por perto!",
      "",
      "Precisa reagendar?",
      `ðŸ”— ${linkReag}`,
      "",
      "Estamos Ã  disposiÃ§Ã£o! âš–ï¸"
    ].join("\n")

    await enviar(numero, msg, null, false)

    // Se tiver nÃºmero do caso, atualizar stage no HubSpot
    if (caseid) {
      for (const [from, u] of Object.entries(users)) {
        if (u.numeroCaso === caseid && u.negocioId) {
          await hsMoverStage(u.negocioId, HS_STAGE.agendamento)
          break
        }
      }
    }

    return res.sendStatus(200)
  } catch (e) { logErro("agendamento", e.message); return res.sendStatus(500) }
})

app.listen(PORT, () => console.log(`Oraculum v6.2.1 â€” porta ${PORT}`))

