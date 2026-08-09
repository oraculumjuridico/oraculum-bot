# Oráculum — execução até o gate final

## Objetivo

Consolidar localmente os fluxos do cliente, WhatsApp, Admin/pós-humano, importação e documentação, preservando um único caso canônico e deixando commits locais revisáveis. Nenhuma ação externa faz parte desta execução.

## Invariantes

- Um caso, uma verdade: Contact, Deal, `numeroCaso`, pasta e histórico permanecem vinculados.
- `document-state`/registry são a verdade documental; `u.docs*` é projeção.
- Terceiro não alimenta o titular; incerteza e divergência forte exigem revisão.
- Uma pergunta por vez, sem repetir resposta ou documento recebido.
- Um ciclo pós-humano ativo por negócio, com idempotência e retomada após restart.
- Janela WhatsApp de 24h nasce somente de mensagem real do cliente.
- Nenhuma escrita externa, deploy, migration, push ou uso de credencial real.

## Marcos

- [x] 0. Nomenclatura jurídica canônica — commit `99bdf56`.
- [x] 1. Jornada completa do cliente e Menu — saudação local, sem dependência externa.
- [x] 2. WhatsApp 24h e templates — restauração não fabrica janela recente.
- [x] 3. Admin, Atendimento Assistido e pós-humano — regressões integradas aprovadas.
- [x] 4. Importação/local e convergência — relatório dry-run canônico validado sem rede.
- [x] 5. Pendências: RG real e voz/TTS — TTS Unicode comprovado; RG permanece pendente de evidência real.
- [x] 6. Documentação técnica durável — contexto curto e arquitetura operacional consolidados.
- [ ] 7. Auditoria integrada e gate final.

## Decisões comprovadas

- Nomenclatura separa área, subtipo, situação e objetivo, com revisão/histórico.
- Intenção de obter após indeferimento canônico resulta em `reverter_indeferimento`.
- O Menu Cliente usa saudação inclusiva determinística e não consulta IA externa.
- Reconhecimento real do verso do RG permanece pendente até evidência de runtime.
- A cadeia TTS preserva acentos e cedilha até a requisição UTF-8 e mantém a saída OGG/OPUS.

Additional verified decisions:

- The 24-hour window uses only a real persisted `ultimaMsg`; a HubSpot restore without it keeps the window closed.
- The exact 24-hour boundary remains open, while one millisecond beyond it requires an approved template.

## Gates finais

- Testes focados e de integração por marco.
- `npm run test:post-human` e suítes canônicas.
- `npm test` com diagnóstico objetivo de eventual timeout.
- `node --check`, `git diff --check`, auditoria do conjunto e status Git explicado.

## Bloqueadores e pendências

- Nenhum bloqueador local no início.
- Validação real de RG pode permanecer pendente se depender da imagem/log de produção.
