"use strict"

function limparRotulo(valor = "") {
  return String(valor)
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function descricaoAcao(id = "", label = "") {
  const chave = String(id)
  const rotulo = limparRotulo(label) || "esta opção"
  const exatas = {
    m_status: "ver o andamento, os documentos e o agendamento do caso",
    m_docs: "enviar documentos ou conferir o que ainda falta",
    m_adv: "ver as opções para falar com um advogado",
    m_inicio: "voltar ao menu principal do cliente",
    m_novocaso: "iniciar o atendimento de um caso diferente",
    docs_depois: "salvar o progresso e continuar em outro momento",
    docs_proxdoc: "seguir para a próxima parte ou para o próximo documento",
    docs_maisFotos: "enviar outra foto ou página deste documento",
    docs_pular_doc: "informar que você não possui esta parte agora",
    docs_rg_verso_junto: "confirmar que frente e verso estão no mesmo arquivo e seguir para o próximo documento",
    docs_rg_sem_verso: "registrar o RG como incompleto e seguir para o próximo documento",
    docs_enviar_faltantes: "começar o envio dos documentos que ainda faltam",
    docs_ver_status: "conferir o andamento atual dos documentos",
    doc_cliente_anexar: "confirmar que o arquivo deve ser anexado ao caso",
    adv_agendar_ligacao: "escolher uma data e um horário para a consulta",
    adv_urg: "enviar uma mensagem urgente para a equipe",
    ag_confirmar: "confirmar a consulta com os dados mostrados na tela",
    ag_outro_horario: "voltar e escolher outro horário",
    slots_proxima_pagina: "ver os próximos horários disponíveis",
    slots_pagina_anterior: "voltar aos horários anteriores",
    conf_ok: "confirmar que os dados estão corretos",
    conf_corrigir: "informar qual dado precisa ser corrigido",
    audio_dados_confirmar: "confirmar que os dados estão corretos e registrar o caso",
    audio_dados_corrigir: "corrigir uma informação antes de registrar o caso",
    conf_menu: "voltar à etapa anterior"
  }
  if (exatas[chave]) return exatas[chave]
  if (/^slot_\d+$/.test(chave)) return `selecionar o horário ${rotulo}`
  if (/^dur_/.test(chave)) return `escolher ${rotulo} como tempo de atendimento`
  if (/^m_caso_/.test(chave)) return `selecionar o caso ${rotulo}`
  if (/confirm|_sim$|_ok$/.test(chave)) return `confirmar ${rotulo}`
  if (/corrig|editar|alterar/.test(chave)) return `corrigir ou alterar ${rotulo}`
  if (/cancel/.test(chave)) return `cancelar ${rotulo}`
  if (/voltar|anterior/.test(chave)) return `voltar para ${rotulo}`
  return `escolher ${rotulo}`
}

function orientarTextoComAcoes(texto = "", acoes = []) {
  // Os próprios botões já apresentam as ações disponíveis. Repetir cada
  // rótulo e sua descrição no corpo deixa as telas longas e redundantes.
  // A orientação detalhada permanece no áudio por orientarAudioAcao().
  return String(texto || "").trim()
}

function orientarAudioAcao(acao = {}) {
  if (acao.textoAudio) return String(acao.textoAudio).trim().replace(/[.\s]+$/, "")
  const label = limparRotulo(acao.label || acao.title)
  const descricao = descricaoAcao(acao.id, label)
  if (descricao === `escolher ${label}`) return `Para ${label}, toque em ${label}`
  return `Para ${descricao}, toque em ${label}`
}

module.exports = { limparRotulo, descricaoAcao, orientarTextoComAcoes, orientarAudioAcao }
