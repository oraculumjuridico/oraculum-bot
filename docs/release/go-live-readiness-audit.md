# Auditoria de prontidão para Go-Live

Data da auditoria: 02/07/2026
Escopo: estado atual do workspace do Bot Oráculum
Natureza: auditoria técnica, sem alteração de código ou testes

## Resumo executivo

O sistema apresenta boa maturidade funcional: os principais fluxos possuem
testes de caracterização, o HubSpot respondeu ao smoke test real, as
credenciais de leitura do Google Drive e do Google Calendar estão funcionais,
há deduplicação de mensagens, fila e lock por usuário, persistência atômica em
arquivo e proteções de webhook.

O sistema, porém, **não está pronto para receber clientes reais no estado
atual**. Há quatro bloqueadores:

1. arquivos e áudios enviados ao Drive recebem permissão
   `reader/anyone`, tornando material jurídico acessível por link;
2. `APP_SECRET`/`META_APP_SECRET` não está configurado no ambiente auditado;
   em produção, o webhook da Meta será recusado com HTTP 503;
3. o release não é reproduzível: há alterações críticas não commitadas e 115
   arquivos não rastreados no workspace;
4. o webhook responde HTTP 200 antes de existir processamento ou enfileiramento
   durável; falha ou reinício depois do ACK pode perder a mensagem sem retry.

Nota geral de prontidão: **5,5/10**.

## Evidências e validações executadas

Foram executados com sucesso:

- `npm test`;
- testes específicos de cliente, seleção de caso, UX declarativa e navegação;
- testes documentais e de prioridade documental;
- testes de áudio e pós-áudio;
- testes dos handlers híbridos de revalidação;
- testes de `CONFIRMAR_ENTRADA`;
- testes de contrato e sanitização de logs do HubSpot;
- `node --check server.js`;
- `git diff --check`;
- smoke real e somente leitura do HubSpot;
- probe real e somente leitura do Google Drive;
- probe real e somente leitura do Google Calendar;
- `npm run consultation:release-check`.

Resultados externos:

- HubSpot: autenticação e schemas de contatos/deals válidos;
- Google Drive: autenticação e leitura válidas;
- Google Calendar: autenticação e `freebusy` válidos;
- release check de consultas: aprovado, versão de domínio `9.0.0`.

Não foram realizados envios reais pelo WhatsApp, uploads reais, criação de
eventos, criação de contatos/deals ou testes destrutivos.

## Quadro geral

| Item | Classificação | Síntese |
|---|---|---|
| 1. Fluxos do cliente | Atenção | Boa cobertura funcional, mas ainda sem E2E real e com grande orquestrador legacy |
| 2. Fluxos documentais | Bloqueador | Uploads recebem acesso público por link |
| 3. Áudios | Atenção | Fluxos testados, mas dependem de várias integrações e buffers não sobrevivem a restart |
| 4. HubSpot | Pronto | Smoke real e contrato aprovados; faltam retry/backoff e alertas operacionais |
| 5. Google Calendar | Atenção | Leitura real aprovada e domínio robusto; falta canário real de escrita controlada |
| 6. Google Drive | Bloqueador | Credencial funciona, mas política `anyone/reader` é incompatível com sigilo jurídico |
| 7. WhatsApp | Bloqueador | Segredo de assinatura Meta ausente no ambiente auditado |
| 8. Timers | Atenção | Restaurados parcialmente, mas são locais e não preservam prazo exato |
| 9. Seleção de caso | Pronto | Persistência e navegação possuem testes dedicados |
| 10. Revalidação cadastral | Atenção | Comportamento coberto, porém execução híbrida ainda mantém duplicação física legacy |
| 11. Agendamento | Atenção | Boa arquitetura e testes; falta validar escrita real e operação de callbacks |
| 12. Área do cliente | Pronto | Telas, navegação, documentos e cabeçalho de caso têm caracterização |
| 13. Tratamento de erros | Bloqueador | ACK antecipado sem fila durável pode transformar falha assíncrona em perda silenciosa |
| 14. Persistência | Atenção | Escrita local atômica, mas durabilidade do volume e backup não estão comprovados |
| 15. Observabilidade e logs | Atenção | Logs sanitizados, porém sem retenção, métricas externas ou alertas |

## 1. Fluxos do cliente — Atenção

### Pontos positivos

- Navegação, menu, modo declarativo, seleção de caso e intenções possuem testes.
- Há fila serial por usuário e lock adicional para evitar concorrência.
- Mensagens duplicadas são filtradas por ID e por chave de fallback.
- O processamento possui fallback amigável quando uma exceção chega à camada
  externa.
- Fluxos de entrada, retorno, terceiros, revalidação e pós-áudio foram
  progressivamente isolados e caracterizados.

### Riscos

- `processarInterno()` continua concentrando milhares de linhas e muitos
  branches com efeitos externos.
- A cobertura principal de `npm test` não inclui automaticamente vários testes
  históricos de cliente; eles precisaram ser executados separadamente.
- Ainda não existe teste ponta a ponta com payload real da Meta, resolução no
  HubSpot e envio de resposta.
- A execução híbrida mantém handler e branch legacy fisicamente duplicados,
  aumentando risco de divergência futura.

### Condição para Go-Live

Não é bloqueador isolado, desde que exista piloto controlado, roteiro de
aceitação manual e congelamento de mudanças durante a validação.

## 2. Fluxos documentais — Bloqueador

### Pontos positivos

- Há testes de integridade, prioridade de intenção e telas documentais.
- Falhas de criação de pasta, download e upload produzem resposta compreensível
  e não avançam silenciosamente o fluxo.
- O arquivo pendente é preservado até confirmação do cliente.
- Uploads temporários locais são removidos em `finally`.
- O fluxo diferencia documento guiado e arquivo avulso.

### Bloqueador

Em `src/domain/drive-files.js`, todo upload chama
`tornarArquivoPublicoDrive()`. Essa função cria:

```js
{
  role: "reader",
  type: "anyone"
}
```

Isso vale também para áudios salvos no Drive. Qualquer pessoa que obtenha o
link pode acessar material que pode conter documentos pessoais, dados de saúde,
informações previdenciárias, trabalhistas, familiares ou criminais.

Essa política conflita com a mensagem de sigilo e LGPD apresentada ao cliente.

### Correção obrigatória

- remover permissão pública automática;
- usar compartilhamento restrito à conta/equipe autorizada ou URLs temporárias;
- revisar e revogar permissões públicas já concedidas;
- registrar política de retenção e acesso;
- executar teste real de upload, leitura autorizada e negação anônima.

## 3. Áudios — Atenção

### Pontos positivos

- Entrada, confirmação de transcrição, classificação e pós-áudio têm testes.
- Há mensagens específicas para mídia ausente, transcrição inválida e fallback.
- Timeouts globais existem para Axios e FFmpeg.
- Falhas de TTS geralmente não impedem a continuidade textual.

### Riscos

- O pipeline depende de WhatsApp Media API, AssemblyAI, Groq, TTS, FFmpeg,
  Drive e rede numa mesma jornada.
- Não há smoke integrado dessas dependências.
- Alguns erros são deliberadamente absorvidos para preservar UX, ficando
  visíveis apenas em log.
- Buffers como `_audioDescBuffer` e `_urgenteAudioBuffer` são removidos da
  persistência. Um restart no meio do fluxo exige reenvio do áudio.
- O salvamento público no Drive também afeta áudios.

### Antes do Go-Live

- corrigir a política do Drive;
- validar ao menos um áudio real curto, longo, inaudível e interrompido;
- documentar fallback operacional quando transcrição ou TTS estiver indisponível.

## 4. HubSpot — Pronto

### Evidências

- Token configurado no ambiente auditado.
- Smoke real de leitura aprovado.
- Schemas de contatos e negócios contêm as propriedades obrigatórias.
- Enums essenciais foram validados.
- Contrato de escrita possui teste.
- Logs do HubSpot removem telefone, CPF, Bearer token e valores sensíveis.
- Sincronização usa snapshots para evitar writes desnecessários.

### Riscos residuais

- Não foi encontrado mecanismo geral de retry exponencial para HTTP 429/5xx.
- Há vários efeitos distribuídos entre memória, HubSpot, Drive e WhatsApp sem
  transação única.
- O health check público não avalia autenticação ou latência do HubSpot.

### Recomendação

Pode ir ao ar após os bloqueadores gerais, com alerta para 401, 403, 409, 429 e
5xx e procedimento manual de reconciliação.

## 5. Google Calendar — Atenção

### Pontos positivos

- OAuth e consulta `freebusy` reais foram validados.
- O calendário e timezone são explícitos.
- Há eventos de domínio, idempotência, reconciliação, read model, auditoria,
  integridade, recuperação de sessão e release check.
- A arquitetura possui guards contra escrita direta indevida.

### Riscos

- O ID do calendário está hardcoded como
  `oraculum.juridico@gmail.com`.
- Não foi criado/cancelado evento real nesta auditoria.
- A operação depende de callbacks internos externos ao WhatsApp.
- É necessário confirmar que o ambiente de produção usa enforcement estrito,
  não somente modo `warn`.

### Gate recomendado

Executar um canário controlado em calendário de homologação: criar, consultar,
reagendar, cancelar e reconciliar o mesmo evento.

## 6. Google Drive — Bloqueador

### Evidências positivas

- OAuth de leitura está funcional.
- Criação de pasta e upload possuem tratamento de falha.
- Arquivos temporários locais são removidos.
- Nomes locais são sanitizados.

### Bloqueador

A permissão `anyone/reader` é aplicada automaticamente a documentos e áudios.
O problema é de confidencialidade, não apenas de disponibilidade.

### Riscos adicionais

- Não há smoke automatizado no pipeline de release.
- Falhas retornam `null`, mas não há fila de retry operacional.
- Não há verificação periódica de arquivos órfãos, uploads duplicados ou
  permissões incorretas.

## 7. WhatsApp — Bloqueador

### Pontos positivos

- Token, Phone Number ID e Verify Token estão configurados.
- O webhook suporta verificação da Meta.
- A assinatura usa HMAC SHA-256 e comparação timing-safe.
- Em produção, ausência do segredo causa falha fechada.
- Há deduplicação, serialização por usuário e marcação de leitura/digitação.

### Bloqueador de configuração

No ambiente auditado, `APP_SECRET` e `META_APP_SECRET` estão ausentes. Com
`NODE_ENV=production`, `validarAssinaturaMeta()` retorna HTTP 503 para todo
POST do webhook.

Não é aceitável contornar isso usando ambiente de desenvolvimento, pois nesse
modo a assinatura deixa de ser validada.

### Antes do Go-Live

- configurar o App Secret da Meta no ambiente de produção;
- confirmar `NODE_ENV=production`;
- enviar payload assinado válido e inválido;
- validar o token permanente e a expiração;
- executar teste real de recebimento e resposta com número de homologação.

## 8. Timers — Atenção

### Pontos positivos

- Timers anteriores são limpos antes da substituição.
- Callbacks verificam usuário, instância do estado e timestamp esperado.
- Há lock por usuário dentro do callback.
- Timers recentes são restaurados na inicialização.

### Riscos

- Timers são `setTimeout` em memória e não são distribuídos.
- O prazo restante exato não é persistido; após restart, a janela é recalculada.
- Apenas conversas recentes recebem timer restaurado.
- Com mais de uma instância do bot, cada processo teria memória, locks e timers
  independentes.
- Reinícios podem atrasar, antecipar ou omitir reengajamentos.

### Recomendação

Go-Live inicial deve usar uma única instância. Migração para job store/fila
durável pode vir depois, mas o comportamento de restart precisa ser testado
antes.

## 9. Seleção de caso — Pronto

### Evidências

- Há teste específico de persistência da seleção.
- Cabeçalho do caso ativo e navegação foram caracterizados.
- Contexto de documentos do caso selecionado é separado.
- O fluxo pergunta caso atual versus novo caso antes de anexar nova situação.

### Risco residual

O estado transitório do menu é removido na serialização. Após restart, a tela
pode precisar ser reconstruída. Isso é aceitável se o fallback ao menu for
validado manualmente.

## 10. Revalidação cadastral — Atenção

### Cobertura híbrida atual

Possuem handlers:

- confirmação do nome;
- correção textual do nome;
- confirmação da cidade;
- seleção entre cidades homônimas;
- confirmação do telefone;
- correção textual do telefone.

### Pontos positivos

- Os handlers respeitam a regra de fallback apenas antes do primeiro efeito.
- Erros posteriores à mutação são propagados.
- Os branches legacy permanecem disponíveis para casos não aplicáveis.
- Testes cobrem mutações, retries e continuação dos fluxos.

### Riscos

- Nome em áudio, cidade por texto/áudio, telefone em áudio e `WAIT` continuam
  exclusivamente legacy.
- A duplicação física entre handler e branch legacy pode divergir.
- Ainda não é o momento de remover o legacy sem observação operacional.

### Conclusão

Não bloqueia um piloto, mas exige monitoramento e congelamento de alterações
nessa região.

## 11. Agendamento — Atenção

### Pontos positivos

- Disponibilidade, criação, status, cancelamento, idempotência, reconciliação e
  integridade possuem cobertura ampla.
- Release check específico foi aprovado.
- O Calendar respondeu à consulta real de disponibilidade.
- Rotas internas exigem segredo.

### Riscos

- Não houve canário real de escrita nesta auditoria.
- Rotas como `/evento-cancelado`, `/pos-consulta`, `/consulta-status` e
  `/lembrete` dependem de automação externa corretamente configurada.
- Erros de notificação administrativa são assíncronos e não impedem o fluxo.
- O calendário é fixo no código.

### Antes do Go-Live

Validar ponta a ponta com um evento de homologação e confirmar autenticação das
automações que chamam as rotas internas.

## 12. Área do cliente — Pronto

### Evidências

- Menu e telas declarativas possuem testes.
- Há teste de terminologia de consulta.
- Documentos, status, advogado, caso atual/novo e navegação são cobertos.
- Mensagem não reconhecida retorna ao menu.
- Arquivos pendentes são protegidos contra substituição acidental.

### Melhorias não bloqueantes

- reduzir esperas fixas de 2–6 segundos em sequências de áudio;
- oferecer indicador mais claro quando integração externa estiver lenta;
- manter sempre uma saída textual curta quando TTS falhar;
- padronizar “tentar novamente” e acesso ao advogado em todas as telas de erro.

## 13. Tratamento de erros — Bloqueador

### Pontos positivos

- Há tratamento central em `processarComLock`.
- O usuário recebe fallback textual em falhas gerais.
- A fila continua drenando mesmo quando uma mensagem falha.
- Erros de integrações são categorizados.
- Erros HubSpot são sanitizados.

### Bloqueador de confiabilidade

O POST `/webhook`:

1. monta a lista de mensagens;
2. responde HTTP 200;
3. só depois inicia o processamento com `setImmediate`.

Não existe fila durável entre os passos 2 e 3. Se o processo reiniciar, cair ou
for encerrado depois do ACK e antes da conclusão, a Meta considera a entrega
bem-sucedida e a mensagem pode ser perdida.

Além disso:

- a deduplicação existe apenas em memória;
- não há dead-letter queue;
- não há retry persistente de mensagens que falharam;
- a falha assíncrona é somente registrada em log.

### Correção obrigatória

Antes de clientes reais, é necessário ao menos um destes modelos:

- persistir a mensagem recebida antes do HTTP 200 e processá-la por fila;
- usar broker/fila durável;
- ou processar antes do ACK dentro do limite da Meta, com idempotência
  persistente.

## 14. Persistência — Atenção

### Pontos positivos

- Escrita usa arquivo temporário exclusivo, `fsync` e rename.
- Há debounce e espera máxima.
- SIGINT, SIGTERM e `beforeExit` tentam persistir.
- Hidratação normaliza listas e estados legados.
- Estado é restaurado na inicialização.

### Riscos

- A persistência primária de conversas é um arquivo local JSON.
- Não foi comprovado que o ambiente de produção possui disco persistente.
- Não há backup, versionamento ou restauração testada do arquivo completo.
- Erro de escrita é logado, mas não interrompe saúde nem dispara alerta.
- Dados jurídicos e pessoais ficam em repouso sem evidência de criptografia.
- Buffers de áudio e alguns estados transitórios não são persistidos.

### Gate

Confirmar volume persistente, política de backup, restauração, permissões do
arquivo e retenção. Se o deploy usar filesystem efêmero, este item passa a ser
**Bloqueador**.

## 15. Observabilidade e logs — Atenção

### Pontos positivos

- Há `/health`, `/health-interno` e resumo diário protegido.
- Logs HubSpot removem dados sensíveis conhecidos.
- Existem métricas e auditoria específicas para consultas.
- O monitor expõe uptime, conversas, cadastros, usuários e quantidade de erros.

### Lacunas

- `/health` sempre responde `ok` e não testa WhatsApp, HubSpot, Calendar, Drive,
  transcrição, TTS ou persistência.
- O monitor guarda apenas os últimos 100 erros em memória.
- Não há evidência de agregador externo, retenção, dashboard ou alerta.
- Não há correlation ID ponta a ponta por mensagem.
- Não há métricas de taxa de sucesso, latência, fila, retries, uploads,
  transcrições ou mensagens perdidas.
- Stacks completos podem chegar ao stdout e precisam de revisão adicional de
  dados pessoais fora do caminho HubSpot.

### Antes do Go-Live

Configurar alertas mínimos para webhook 5xx, falhas de envio, falhas de
persistência, HubSpot 401/429/5xx, Drive, Calendar e transcrição.

## Estado do release

O workspace auditado não corresponde a um release reproduzível:

- há arquivos rastreados modificados;
- há arquivo rastreado removido;
- há 115 arquivos não rastreados;
- `package.json`, `server.js` e módulos críticos estão modificados;
- a suíte atual depende de arquivos de consulta ainda não rastreados.

Isso impede afirmar que um deploy feito a partir do commit atual terá o mesmo
comportamento que passou nos testes locais.

Antes do Go-Live:

1. separar alterações deliberadas de artefatos locais;
2. garantir que todos os módulos necessários estejam rastreados;
3. gerar commit/release identificável;
4. executar as mesmas validações a partir de checkout limpo;
5. registrar hash do release implantado;
6. testar rollback para o release anterior.

## Respostas finais

### A) Quais são os bloqueadores reais de Go-Live?

1. Permissão pública `anyone/reader` nos documentos e áudios do Drive.
2. Ausência de `APP_SECRET`/`META_APP_SECRET` no ambiente auditado.
3. ACK do webhook antes de enfileiramento/processamento durável.
4. Release não reproduzível por causa do worktree não consolidado.
5. Persistência local sem volume durável é bloqueador condicional; precisa ser
   comprovada antes da liberação.

### B) Quais melhorias de UX ainda valem a pena?

- reduzir esperas fixas de áudio;
- mostrar estado de “processando” consistente em operações lentas;
- padronizar retry e acesso ao advogado nas telas de falha;
- explicar quando áudio precisará ser reenviado após interrupção;
- oferecer confirmação mais clara do caso ativo antes de anexar documento;
- manter fallback textual em toda falha de TTS.

Essas melhorias são úteis, mas não devem preceder segurança documental,
durabilidade e webhook confiável.

### C) Quais riscos operacionais ainda existem?

- perda de mensagem após ACK;
- duplicação após restart por dedupe somente em memória;
- perda de estado em filesystem efêmero;
- timers inconsistentes após restart ou múltiplas instâncias;
- indisponibilidade conjunta de serviços externos;
- rate limit do HubSpot sem retry geral;
- falhas de Drive/Calendar sem alerta;
- divergência entre handlers híbridos e legacy;
- callbacks de agendamento configurados incorretamente;
- logs sem retenção e alertas;
- exposição de documentos por link.

### D) O que deve ser corrigido antes de colocar clientes reais?

Ordem obrigatória:

1. tornar documentos e áudios privados e revogar links públicos existentes;
2. configurar e testar o App Secret da Meta em produção;
3. consolidar um release limpo e reproduzível;
4. garantir fila ou inbox durável antes do ACK do webhook;
5. comprovar disco persistente, backup e restauração;
6. executar E2E real controlado de WhatsApp, documento, áudio e agendamento;
7. configurar alertas operacionais mínimos;
8. criar roteiro de rollback e plantão para o piloto.

### E) O que pode ficar para depois do Go-Live?

- concluir extrações híbridas restantes;
- criar execution-router definitivo;
- remover branches legacy após estabilidade;
- reduzir o tamanho de `processarInterno`;
- migrar timers para scheduler distribuído, desde que o Go-Live use uma única
  instância;
- refinar animações, textos e tempos de áudio;
- dashboards avançados;
- canários automáticos mais sofisticados;
- otimizações de performance que não afetem segurança ou confiabilidade.

### F) Nota geral de prontidão

**5,5/10.**

Funcionalmente, o sistema está próximo de um piloto e possui cobertura melhor
que a média para fluxos complexos. A nota cai por três fatores de produção:
confidencialidade documental, durabilidade de mensagens/estado e ausência de
release reproduzível.

Após corrigir os bloqueadores, executar um E2E controlado e provar backup e
rollback, a prontidão estimada sobe para aproximadamente **8/10**, adequada
para Go-Live gradual com poucos clientes e monitoramento próximo.
