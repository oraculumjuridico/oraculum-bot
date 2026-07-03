# Auditoria de templates da Meta — Pilot Readiness

Data: 2026-07-03
Escopo: WhatsApp Cloud API, mensagens iniciadas pelo sistema e dependência da janela de atendimento.

## Resumo executivo

O código possui suporte funcional a um único template: a notificação de abertura de
caso para terceiro. O ambiente local tem nome, idioma e imagem desse template
configurados, mas o repositório não contém evidência exportada do Meta Business
Manager que permita confirmar nome remoto, categoria, versão ou status de
aprovação.

Todas as demais comunicações proativas usam mensagens livres por `enviar()`.
Assim, elas dependem de uma janela de atendimento aberta e podem falhar quando
disparadas fora dela.

## Inventário existente

| Template/configuração | Uso | Parâmetros | Evidência local | Situação |
|---|---|---|---|---|
| `WHATSAPP_TEMPLATE_TERCEIRO` | Primeiro contato com a pessoa para quem um terceiro abriu um caso | nome, solicitante, número do caso e área | `server.js:1946-1954`, `.env.example:15-17` | Implementado e configurado no ambiente; aprovação remota não verificável pelo repositório |
| `WHATSAPP_TEMPLATE_LANG` | Idioma do template acima | padrão `pt_BR` | `server.js:359`, `whatsapp-transport.js:79` | Implementado |
| `WHATSAPP_TEMPLATE_TERCEIRO_IMAGEM_URL` | Cabeçalho opcional de imagem | URL pública da imagem | `server.js:360`, `whatsapp-transport.js:82-88` | Implementado e configurado |

Não foram encontradas outras chamadas a `enviarTemplateWhatsApp()`, outros nomes
de template ou um catálogo versionado de templates aprovados.

## Mapa de mensagens proativas

| Fluxo | Local | Transporte atual | Dependência da janela | Consequência fora da janela |
|---|---|---|---|---|
| Abertura de caso para terceiro | `server.js:1946-1976` | Template; mensagem livre como fallback | Template não depende de janela; fallback depende | Se o template estiver ausente/reprovado, o fallback pode falhar; há alerta no HubSpot |
| Incentivo para concluir descrição | `server.js:2944-2977` | Áudio e mensagem livre após 2–3 minutos | Sim, mas normalmente permanece dentro da sessão | Risco baixo durante execução normal |
| Pausa/reengajamento por inatividade | `server.js:3023-3120` | Áudio e mensagem livre após poucos minutos | Sim | Falha se a janela já estiver fechada ou o timer for executado tardiamente |
| Confirmação externa de agendamento | `POST /agendamento`, `server.js:14493-14528` | Mensagem livre | Sim | Pode falhar fora da janela; a rota ainda responde sem comprovar entrega |
| Lembretes de consulta: 24h, hoje e 1h | `POST /lembrete`, `server.js:14823-14888` | Mensagem livre | Sim | O lembrete de 24h é especialmente sujeito a falhar; a rota não usa template |
| Pedido administrativo de documentos | `pedirDocsCasoAdmin()`, aproximadamente `server.js:4260-4310` | Mensagem interativa livre | Sim | Operador pode receber indicação de falha, mas cliente não é alcançado |
| Lembrete administrativo do caso | `enviarLembreteCasoAdmin()`, aproximadamente `server.js:4406-4460` | Mensagem interativa livre | Sim | Cliente não recebe o lembrete fora da janela |
| Cancelamento de consulta pelo administrador | aproximadamente `server.js:4648-4680` | Mensagem livre | Sim | Calendar pode ser atualizado e o cliente não ser avisado |

Mensagens enviadas como resposta direta ao webhook do usuário fazem parte do
atendimento corrente e não precisam de um template enquanto a janela estiver
aberta.

## Recuperação e reengajamento

- A retomada normal começa quando o usuário volta a escrever. A nova mensagem do
  usuário reabre o contexto de atendimento; as telas de retomada podem continuar
  como mensagens livres.
- `AUTO_REENGAJAMENTO` está desativado por padrão. Quando habilitado, os avisos
  automáticos são disparados poucos minutos após a última mensagem e não possuem
  template.
- Não existe campanha autônoma de recuperação de leads antigos.
- Não existe template de reabertura de atendimento após 24 horas.

## Templates ausentes

### Necessários para o piloto

1. **Notificação de terceiro** — já implementado; confirmar aprovação e
   parâmetros no Meta Business Manager antes do piloto.
2. **Atualização de agendamento** — template utilitário parametrizado para
   confirmação, lembrete e alteração/cancelamento. Deve cobrir a rota
   `/agendamento`, os lembretes de 24h/hoje/1h e o cancelamento administrativo.
3. **Pendência operacional do caso** — template utilitário parametrizado para
   pedido de documentos ou próxima ação. Necessário apenas se essas ações
   administrativas forem usadas proativamente no piloto.

### Pode ficar fora do piloto

- Reengajamento de lead antigo: `AUTO_REENGAJAMENTO=false` evita o disparo.
- Campanhas ou marketing: não há fluxo implementado.
- Recuperação após abandono superior a 24 horas: pode depender de o usuário
  iniciar novamente a conversa durante o piloto.

## Redundância

Não há template redundante no código: existe somente um. Criar templates
separados para confirmação, 24h, “hoje” e 1h seria redundante se a Meta aprovar
um único template utilitário de atualização de agendamento com parâmetros
adequados.

## Riscos e controles

1. `enviar()` converte erros da API em `false`; as rotas `/agendamento` e
   `/lembrete` não verificam esse retorno antes de responder HTTP 200. Um
   integrador pode considerar entregue algo que falhou.
2. O fallback livre da notificação de terceiro não resolve template ausente
   quando não existe janela aberta com o destinatário.
3. O status remoto de aprovação não está versionado nem testado.
4. A lista dinâmica de documentos pode não caber em um template rígido. Para o
   piloto, o template deve abrir a conversa com uma descrição genérica da
   pendência; a lista detalhada pode ser enviada após resposta do cliente.

## Respostas objetivas

### A) Quais templates existem hoje?

Somente o template configurado por `WHATSAPP_TEMPLATE_TERCEIRO`, destinado à
notificação inicial de terceiro. Seu status de aprovação remoto precisa ser
confirmado no Meta Business Manager.

### B) Quais são realmente necessários para o piloto?

O conjunto mínimo é:

1. notificação de terceiro;
2. atualização de agendamento;
3. pendência operacional do caso, caso pedidos proativos de documentos e
   lembretes administrativos façam parte do piloto.

### C) Existem fluxos que quebram fora da janela de 24h?

Sim: confirmação externa de agendamento, lembretes de consulta, pedidos
administrativos de documentos, lembrete administrativo do caso, aviso de
cancelamento e qualquer reengajamento automático tardio.

### D) Existe template redundante?

Não no estado atual. Deve-se evitar criar quatro templates quase idênticos para
os momentos do agendamento; um template utilitário parametrizado é suficiente,
desde que aprovado pela Meta para os textos pretendidos.

### E) Qual o conjunto mínimo para operar o piloto?

Dois templates se o piloto não usar cobrança proativa de documentos:

1. notificação de terceiro;
2. atualização de agendamento.

Três templates se a equipe usar lembretes e pedidos proativos:

3. pendência operacional do caso.

## Recomendação de liberação

Antes do piloto, exportar ou registrar fora de segredos o nome, idioma,
categoria e status aprovado dos templates no Meta Business Manager. Depois,
implementar a troca das rotas e ações proativas para os nomes efetivamente
aprovados. Esta auditoria não altera o transporte porque não há catálogo remoto
comprovado e usar nomes planejados causaria falhas em produção.
