# Oraculum Advocacia — Registro de Sessões

---

## ⚠️ INSTRUÇÕES PARA O CLAUDE — LEIA ANTES DE TUDO

Você é um assistente técnico continuando um projeto em andamento.
Este documento é o histórico completo do projeto. Leia tudo antes de responder.

### O que fazer ao receber este documento
1. Leia tudo silenciosamente
2. Responda apenas: "Entendido. Projeto Oraculum v6.2 carregado. O que continuamos?"
3. Não peça informações que já estão aqui
4. Não repita explicações já documentadas

### Regras da sessão — CRÍTICAS
- Monitore o tamanho da conversa. Quando estiver longa, avise:
  "⚠️ Estamos chegando perto do limite da sessão. Quer gerar o documento antes de continuar?"
- NUNCA gere o documento no meio da sessão — só quando o usuário pedir
- Ao gerar o documento: atualize TODAS as seções, não apague o histórico anterior
- IMPORTANTE: Avisar o usuário ANTES de esgotar os tokens, não depois
- AO FINAL DE CADA SESSÃO: sempre gere o documento atualizado e apresente o arquivo para download

### Como o usuário trabalha
- Usa Claude para planejar, diagnosticar e gerar prompts
- Usa assistente do VS Code (ou Codex) para aplicar os prompts no código
- Sempre roda node --check server.js após cada alteração
- Cola o resultado do assistente no chat para validação
- Testa no WhatsApp e traz o log + o que apareceu na tela
- NUNCA chamar o assistente de "Codex" — apenas "assistente"

### Convenção de termos
- Usuário = pessoa sem numeroCaso
- Cliente = pessoa com numeroCaso preenchido

### Postura do Claude
- Antes de qualquer refatoração grande, fazer TODAS as perguntas necessárias
- Nunca assumir o que deve ser mantido — sempre confirmar
- O combinado é: manter o que funciona, só adicionar o que foi pedido
- Quando o usuário diz "mantém como está", significa zero alteração naquele trecho

---

## Contexto do Projeto

Bot: Oraculum Advocacia v6.2
Arquivo principal: server.js (7700+ linhas)
Plataforma: WhatsApp Cloud API (Meta)
Integrações: HubSpot CRM · Google Drive · AssemblyAI · Groq AI
Infraestrutura: Render (atual) → migração planejada Oracle Cloud Always Free
Custo: R$ 0,00

### Stack
- Node.js v24 + Express v5.2.1
- HubSpot Free CRM
- Google Drive API
- AssemblyAI (transcrição de áudio)
- Groq API (llama-3.1-8b-instant)
- TTS próprio (tts.js) + ffmpeg (mp3 → ogg)
- Persistência local (data/users-state.json)

### Atendentes virtuais
Sorteadas em sortearAtendente(): Helena, Clara, Beatriz, Isabela, Mariana.
Salvas em u.atendente. Devem ser preservadas durante toda a sessão.
IMPORTANTE: Para novos usuários, u.atendente começa como null.
O sorteio deve ocorrer no início do bloco ACOLHIMENTO:
  if (!u.atendente) u.atendente = sortearAtendente()

### Problema recorrente — porta 10000
netstat -ano | findstr :10000
taskkill /PID <numero> /F
node server.js

---

## Histórico de Sessões

| # | Data | Tema | Status |
|---|------|------|--------|
| 01 | 2026-05-09 | BUG retomada · tela de resumo | Concluída |
| 02 | 2026-05-10 | BUGs resumo retomada · fluxo retomada por stages | Concluída |
| 03 | 2026-05-10 | BUGs modo áudio · texto como substituto de áudio | Concluída |
| 04 | 2026-05-10 | Refatoração fluxo entrada · ASSESSORIA_INICIAL · BUG agendamento | Pendente |
| 05 | 2026-05-16 | Alteração 44 · número de caso com ponto e exibição inline | Concluída |

---

## Sessão 05 — 2026-05-16

ALTERAÇÃO 44: Número de caso com ponto e exibição inline
  Correção: `gerarCaso()` passou de `SIGLA-AAMMDD-NNN` para `SIGLA.AAMMDD.NNN`
  Exemplo: `FAM.260516.945`
  Motivo: o hífen quebrava o fundo cinza do WhatsApp Mobile mesmo com triple backtick inline.
  Exibição final: `📄 *Número do caso:* [triple backtick]numeroCaso[triple backtick]` na mesma linha do rótulo.
  Locais alterados: `gerarCaso()` linha ~1272, `conf_ok` linha ~6755 e `audio_dados_confirmar` linha ~8376.
  Validação: `node --check server.js` passou; `graphify update .` executado.

---

## Sessões 01 e 02 — Resumo

BUG-01: Retomada não levava à tela de resumo — handler rm_continuar adicionado
BUG-02: _stageRetomadaOriginal sendo sobrescrito — captura antes do fluxoEncerrado
BUG-03: Atendente errada no resumo — preservar em todas as funções de reset
BUG-04: Resumo truncado — max_tokens aumentado de 120 para 300
BUG-05: FLOW_INEXISTENTE para stages de acolhimento — adicionados ao flowMap
FEAT: flowAcolhimentoConfirmaWhatsapp e flowAcolhimentoCidade criados

---

## Sessão 03 — 2026-05-10

BUG-06: Texto digitado em AUDIO_AGUARDANDO era rejeitado
  Correção: if (text) agora processa texto como transcrição manual

BUG-07: Feedback visual ausente
  Audio: await enviar(from, "👂 Estou ouvindo seu áudio...") antes de transcrever()
  Texto: await enviar(from, "📖 Lendo sua mensagem...") antes de classificarAreaAudio()

BUG-08: Menu diferente quando origem era texto
  telaConfirmarAreaAudio recebe origemTexto=false
  Quando true, adiciona opcao "✏️ Corrigir texto"

BUG-09: Handler audio_transcricao_texto faltando em AUDIO_CONFIRMAR_AREA_CANAL
  Adicionado handler que volta para AUDIO_AGUARDANDO

BUG-10: Botao rr_corrigir sempre aparecia em flowResumoRetomada
  Agora só aparece se obterCamposResumo(u).length > 0

BUG-11: numeroFormatado não definido em ACOLHIMENTO_CONFIRMA_WHATSAPP
  Adicionado: const numeroFormatado = from.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, "+$1 ($2) $3-$4")

---

## Sessão 04 — 2026-05-10

### Resolvido

BUG-12: Botão "Agendar com advogado" levava ao menu de cliente
  Causa: bloco linha ~5787 interceptava qualquer msg quando numeroCaso preenchido
  Correção: adicionado text !== "dir_agendar" na condição do if

FEAT: Refatoração do fluxo de entrada — Fase 1

FLUXO NOVO:

  ACOLHIMENTO
    → if (!u.atendente) u.atendente = sortearAtendente()
    → áudio 1: apresentação da atendente
    → tela de boas-vindas (texto fixo abaixo)
    → áudio 2: pedido de relato
    → setStage(AUDIO_AGUARDANDO)
    → texto: "Me conta sua situação — pode falar em áudio ou digitar. 🎙️"

  AUDIO_AGUARDANDO
    → áudio recebido → transcreve → classifica área → flowAssessoriaInicial
    → texto recebido → classifica área → flowAssessoriaInicial

  ASSESSORIA_INICIAL (stage novo)
    → Groq gera comentário empático (menciona área, 3 frases, sem prometer resultados)
    → retenta 1x se falhar → fallback texto fixo
    → envia áudio do comentário (se !u.modoTexto)
    → mensagem separada: "Como prefere continuar?"
    → 3 botões:
      [ 🎙️ Enviar novo relato ] [ 🔊 Continuar com áudios ] [ 📝 Continuar com texto ]

  Botão continuar_audio → u.modoTexto = false → ACOLHIMENTO_NOME com áudio
  Botão continuar_texto → u.modoTexto = true  → ACOLHIMENTO_NOME sem áudio
  Botão relato_novo    → salva u._relatoAnterior → AUDIO_AGUARDANDO com áudio diferente

TELA DE BOAS-VINDAS — TEXTO FIXO (NÃO ALTERAR):
  "Olá! 😊
  Seja muito bem-vindo(a) à *Oraculum Advocacia*.
  Meu nome é *[atendente]* e vou acompanhar você neste atendimento inicial.
  Atuamos com excelência em Direito Previdenciário, Direito Trabalhista e diversas outras áreas.
  Conte comigo! 💙"

ARQUIVOS MODIFICADOS NA FASE 1:
  - STAGES: adicionado ASSESSORIA_INICIAL: "assessoria_inicial"
  - STAGES_RETOMADA_IGNORAR: adicionado STAGES.ASSESSORIA_INICIAL
  - flowMap: adicionado [STAGES.ASSESSORIA_INICIAL]: flowAssessoriaInicial
  - flowAssessoriaInicial: criada (linha ~4584)
  - processarAudioCanalAtendimento: redireciona para flowAssessoriaInicial
  - Bloco AUDIO_AGUARDANDO if(text): redireciona para flowAssessoriaInicial
  - Bloco ASSESSORIA_INICIAL em processarInterno: handlers dos 3 botões
  - Bloco ACOLHIMENTO em processarInterno: novo fluxo de entrada

### Pendências da Sessão 04

PENDENTE 1 — URGENTE: Restaurar tela de boas-vindas no bloco ACOLHIMENTO

  A tela de boas-vindas sumiu. Aplicar este prompt no assistente:

  Arquivo: server.js
  Localização: bloco if (u.stage === STAGES.ACOLHIMENTO) — linha ~6148

  Substituir o bloco inteiro por:

  if (u.stage === STAGES.ACOLHIMENTO) {
    if (!u.atendente) u.atendente = sortearAtendente()
    iniciarTimer(from)
    // Áudio 1 — apresentação da atendente
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Olá! Meu nome é ${u.atendente} e vou acompanhar você neste atendimento inicial.`)
      await enviarAudio(from, `${process.env.NGROK_URL}/audios/atendentes/${path.basename(ogg)}`)
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio boas-vindas", e) }
    // Tela de boas-vindas (texto fixo — NÃO ALTERAR)
    await enviar(from, `Olá! 😊\nSeja muito bem-vindo(a) à *Oraculum Advocacia*.\nMeu nome é *${u.atendente}* e vou acompanhar você neste atendimento inicial.\nAtuamos com excelência em Direito Previdenciário, Direito Trabalhista e diversas outras áreas.\nConte comigo! 💙`)
    // Áudio 2 — pedido de relato
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    try {
      const ogg2 = await gerarAudioAtendente(u.atendente,
        `Me conta o que está acontecendo. Estou aqui para ouvir você e preparar seu caso para o advogado já chegar pronto para te atender. Pode falar em áudio ou digitar.`)
      await enviarAudio(from, `${process.env.NGROK_URL}/audios/atendentes/${path.basename(ogg2)}`)
      await new Promise(r => setTimeout(r, 5000))
    } catch (e) { logErro("tts", "Falha áudio pedido relato", e) }
    return {
      texto: `Me conta sua situação — pode falar em áudio ou digitar. 🎙️\n\n_Vou preparar seu caso para o advogado já chegar pronto para te atender._`,
      opcoes: null
    }
  }

  Não altere nenhuma outra parte do arquivo.

PENDENTE 2 — Fase 2: Suprimir áudios quando u.modoTexto = true
  - Criar função gerarAudioSeModoVoz(u, from, texto, delay)
  - Substituir blocos TTS nos handlers de nome, whatsapp, cidade, confirmações
  - Preservar u.modoTexto na retomada (adicionar aos campos de limparDadosCasoAtual e resetarSessaoAtendimento)

PENDENTE 3 — Confirmar fluxo completo após restaurar boas-vindas
  Testar: oi → boas-vindas → relato → assessoria Groq → botões → continuar

PENDENTE 4 — Confirmar retomada funcionando com novo fluxo
PENDENTE 5 — Gerar prompt para FEAT-01 (follow-up 24h)
PENDENTE 6 — Definir canal para FEAT-02 (relatórios)

---

## Campos do Estado do Usuário

_stageRetomadaOriginal: null  — stage onde parou, gravado ANTES de setStage()
_areaDetectada: null          — área identificada pelo áudio
_relatoAnterior: null         — relato anterior quando usuário pede novo relato
atendente: null               — sorteado no ACOLHIMENTO, preservado em reset
_audioCanalTranscricao: null  — transcrição bruta do áudio ou texto digitado
numeroCaso: null              — null=usuário | preenchido=cliente
nome: null
nomeConfirmado: false
area: null
situacao: null
cidade: null
urgencia: null
descricao: null
negocioId: null
contatoId: null
modoTexto: false              — false=áudio | true=só texto (sem TTS)

---

## Mapa de Funções Críticas

flowAssessoriaInicial        linha ~4584   Groq empático + pergunta de modo
processarAudioCanalAtendimento linha ~5141  áudio → transcreve → classifica → flowAssessoriaInicial
Bloco ACOLHIMENTO            linha ~6148   sorteio → boas-vindas → AUDIO_AGUARDANDO
Bloco AUDIO_AGUARDANDO if(text) linha ~6160 texto → classifica → flowAssessoriaInicial
Bloco ASSESSORIA_INICIAL     antes de AUDIO_CONFIRMAR_AREA_CANAL
flowResumoRetomada           linha ~4030   rr_corrigir só aparece se há dados
telaConfirmarAreaAudio       linha ~729    parâmetro origemTexto=false
Bloco cliente retornando     linha ~5787   tem exceção para dir_agendar

---

## Obsidian + Graphify

graphify update .
Substitua graphify-out\wiki\oraculum-sessoes.md pelo arquivo gerado pelo Claude.
