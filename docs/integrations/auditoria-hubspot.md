# Auditoria HubSpot - Oraculum Bot

Data: 2026-06-01

Escopo: leitura do `server.js`, sem alteracao de codigo, ambiente, servidor, ngrok, webhook, tokens ou estado local.

## Resumo executivo

O bot usa o HubSpot como fonte operacional principalmente em **Negocios**. Contatos guardam identificacao basica e alguns campos legados/apoio. O painel/admin e a retomada dependem mais dos negocios, especialmente de `estado_bot_snapshot`, `dealstage`, `numero_de_caso`, `description`, `area_juridica`, `urgencia`, `resumo_cliente` e `descricao_completa`.

Para virar painel no HubSpot com menos dependencia do snapshot JSON, a prioridade e criar/confirmar propriedades estruturadas no objeto **Negocio**. O snapshot deve continuar existindo porque preserva multiplos casos, relato livre, documentos, agenda e estado completo do bot.

## Pontos do codigo auditados

| Trecho | Funcao |
|---|---|
| `server.js:3961` | Busca contato por telefone |
| `server.js:3976` | Cria contato |
| `server.js:4005` | Cria negocio |
| `server.js:4053` | Atualiza contato |
| `server.js:4069` | Atualiza negocio |
| `server.js:4085` | Atualiza negocio com estado do bot |
| `server.js:4149` | Restaura estado a partir do negocio |
| `server.js:4209` | Sincroniza contato e negocio |
| `server.js:4254` | Busca negocio aberto do contato |
| `server.js:4284` | Lista negocios ativos do contato |
| `server.js:4630` | Busca contato do negocio no admin |
| `server.js:4649` | Busca negocios por stage no admin |
| `server.js:6033` | Cria notas no contato |
| `server.js:6046` | Cria notas no negocio |
| `server.js:7300` | Finaliza cadastro e consolida contato/negocio |
| `server.js:15616` | Busca contato a partir de reuniao HubSpot/Calendar |

## Contato

| Propriedade | Uso no codigo | Operacao | Status provavel | Observacao |
|---|---:|---|---|---|
| `firstname` | `server.js:3968`, `server.js:3987`, `server.js:4218`, `server.js:4639` | Le/grava | Nativa | Nome do contato. Em caso de terceiro com telefone ja existente, o codigo evita sobrescrever nome divergente. |
| `phone` | `server.js:3967`, `server.js:3987`, `server.js:4639`, `server.js:15659` | Le/grava/busca | Nativa | Chave principal de localizacao do contato. |
| `city` | `server.js:3987`, `server.js:4219` | Grava | Nativa | Cidade do contato. |
| `area_juridica` | `server.js:3968`, `server.js:3989`, `server.js:10705` | Le/grava | Personalizada provavel | Usada como apoio no contato, mas a visao operacional principal deve ficar no negocio. |
| `numero_caso` | `server.js:3989` | Grava | Personalizada provavel | Campo de contato. Pode ficar legado, porque multiplos casos no mesmo contato tornam este campo ambiguo. |
| `situacao_caso` | `server.js:3990` | Grava | Personalizada provavel | Campo resumido no contato. Ambiguo com multiplos casos. Melhor painelar no negocio. |
| `status_caso` | `server.js:3992` | Grava | Personalizada provavel | Campo de contato. Ambiguo com multiplos casos. |
| `urgencia_caso` | `server.js:3993` | Grava | Personalizada provavel | Campo de contato. Ambiguo com multiplos casos. |
| `pasta_drive` | `server.js:3994` | Grava | Personalizada provavel | Link Drive no contato. Ambiguo com multiplos casos; preferir tambem no negocio. |

## Negocio

| Propriedade | Uso no codigo | Operacao | Status provavel | Observacao |
|---|---:|---|---|---|
| `dealname` | `server.js:4011`, `server.js:4228`, `server.js:7358` | Le/grava | Nativa | Nome do negocio. Inclui cliente/area/numero do caso. |
| `pipeline` | `server.js:4012` | Grava | Nativa | Usa `default`. |
| `dealstage` | `server.js:4013`, `server.js:4097`, `server.js:4322`, `server.js:4656` | Le/grava/busca | Nativa | Principal status de funil. |
| `hubspot_owner_id` | `server.js:4014` | Grava | Sistema | Dono fixo `90513737`. |
| `createdate` | `server.js:4293`, `server.js:4657` | Le/ordena | Sistema | Usado para ordenar casos. |
| `closedate` | `server.js:4262`, `server.js:4293`, `server.js:4658` | Le | Nativa/sistema | Usado para ignorar/futuro contexto de encerramento. |
| `description` | `server.js:1687`, `server.js:4178`, `server.js:4262`, `server.js:4658` | Le/grava | Nativa ou personalizada existente | Guarda o relato livre normalizado. Deve ser preservada. |
| `area_juridica` | `server.js:4015`, `server.js:4293`, `server.js:4659` | Le/grava | Personalizada provavel | Boa para painel. |
| `resumo_cliente` | `server.js:4016`, `server.js:4293`, `server.js:4659` | Le/grava | Personalizada provavel | Resumo curto do caso. Boa para lista/painel. |
| `descricao_completa` | `server.js:4017`, `server.js:4293`, `server.js:4659` | Le/grava | Personalizada provavel | Espelho mais detalhado do relato. |
| `urgencia` | `server.js:4020`, `server.js:1684`, `server.js:4661` | Le/grava | Personalizada provavel | Valores usados: `Alta`, `Moderada`, `Baixa`. Boa para painel. |
| `cidade` | `server.js:4021` | Grava | Personalizada provavel | Gravada no negocio, mas hoje quase nao e lida fora do snapshot. Boa candidata a painel. |
| `pasta_drive` | `server.js:4022` | Grava | Personalizada provavel | Link da pasta Drive do caso. Boa para painel. |
| `origem_atendimento` | `server.js:4023` | Grava | Personalizada provavel | Hoje tende a `whatsapp`. Boa para relatorio de origem. |
| `estado_bot_snapshot` | `server.js:1688`, `server.js:4152`, `server.js:4262`, `server.js:4659` | Le/grava | Personalizada obrigatoria | JSON do estado completo. Critico para retomada, multiplos casos e admin. |
| `etapa_do_bot` | `server.js:1689`, `server.js:4180`, `server.js:4262`, `server.js:4660` | Le/grava | Personalizada obrigatoria | Stage interno do bot. |
| `tipo_de_caso` | `server.js:1690`, `server.js:4179`, `server.js:4262`, `server.js:4660` | Le/grava | Personalizada recomendada | Valor normalizado tipo `inss_aposentadoria`, `familia_*`, etc. |
| `temperatura_lead` | `server.js:1691`, `server.js:4262`, `server.js:4660` | Le/grava | Personalizada recomendada | Valores: `Frio`, `Morno`, `Quente`. |
| `hs_priority` | `server.js:1692`, `server.js:4262`, `server.js:4660` | Le/grava | Pode ser nativa/sistema | Valores enviados: `low`, `medium`, `high`. Confirmar se existe no objeto Negocio do portal. |
| `numero_de_caso` | `server.js:3478`, `server.js:4262`, `server.js:7366` | Le/grava | Personalizada obrigatoria | Fonte oficial do numero do caso no negocio. Critico para multiplos casos. |

## Notas

| Propriedade | Uso no codigo | Operacao | Status provavel | Observacao |
|---|---:|---|---|---|
| `hs_note_body` | `server.js:6037`, `server.js:6050` | Grava | Nativa | Corpo das notas em contatos e negocios. |
| `hs_timestamp` | `server.js:6037`, `server.js:6050` | Grava | Nativa | Timestamp da nota. |

## Reunioes

| Propriedade | Uso no codigo | Operacao | Status provavel | Observacao |
|---|---:|---|---|---|
| `hs_meeting_start_time` | `server.js:15630`, `server.js:15632` | Busca/le | Nativa | Usada para localizar reuniao pelo horario. |
| `hs_meeting_title` | `server.js:15632`, `server.js:15688` | Le | Nativa | Ajuda a classificar se a reuniao e consulta de caso. |
| `hs_meeting_body` | `server.js:15632`, `server.js:15689` | Le | Nativa | Ajuda a classificar se a reuniao e consulta de caso. |

## Propriedades a criar ou confirmar no HubSpot

Status confirmado pelo proprietario: as 12 propriedades de prioridade alta do objeto **Negocio** ja existem. O plano gratuito do HubSpot esta com limite de propriedades personalizadas estourado, em 22 de 10, e o botao de criar propriedade esta desativado. Portanto, a fase 2 deve reutilizar propriedades existentes e nao propor campos novos enquanto nao houver upgrade confirmado.

### Objeto Negocio - prioridade alta

Estas sao as propriedades que mais importam para painel e operacao. Se alguma ja existir, apenas confirmar tipo/opcoes.

| Nome interno | Tipo sugerido | Opcoes sugeridas | Por que criar/confirmar |
|---|---|---|---|
| `numero_de_caso` | Texto linha unica | Livre | Identificador oficial por negocio/caso. |
| `area_juridica` | Selecao unica | INSS, Trabalhista, Familia, Consumidor, Penal, Civil, Imovel, Outros | Filtro principal do painel. |
| `urgencia` | Selecao unica | Alta, Moderada, Baixa | Filtro de risco operacional. |
| `cidade` | Texto linha unica | Livre | Filtro geografico. |
| `pasta_drive` | Texto/URL | Livre | Acesso rapido aos documentos do caso. |
| `origem_atendimento` | Selecao unica | whatsapp, manual, indicacao, outro | Relatorio de origem. |
| `resumo_cliente` | Texto multilinha | Livre | Resumo curto para lista e painel. |
| `descricao_completa` | Texto multilinha | Livre | Relato detalhado, preservando relato livre. |
| `estado_bot_snapshot` | Texto multilinha | JSON | Retomada e reconstrucao do estado do bot. |
| `etapa_do_bot` | Texto linha unica ou selecao | Stages internos | Diagnostico operacional do funil do bot. |
| `tipo_de_caso` | Texto linha unica ou selecao | Valores normalizados do bot | Segmentacao por subtipo. |
| `temperatura_lead` | Selecao unica | Frio, Morno, Quente | Priorizacao comercial/operacional. |

### Objeto Contato - manter simples

Criar/confirmar apenas se o portal ainda nao tiver, mas evitar depender deles para painel de casos por causa de multiplos casos no mesmo contato.

| Nome interno | Tipo sugerido | Opcoes sugeridas | Observacao |
|---|---|---|---|
| `area_juridica` | Selecao unica | Mesmas areas do negocio | Apoio/legado; preferir negocio para painel. |
| `numero_caso` | Texto linha unica | Livre | Ambiguo quando contato tem varios casos. |
| `situacao_caso` | Texto linha unica | Livre | Ambiguo com varios casos. |
| `status_caso` | Selecao unica | Em analise, Urgente, Finalizado | Ambiguo com varios casos. |
| `urgencia_caso` | Selecao unica | Alta, Moderada, Baixa | Ambiguo com varios casos. |
| `pasta_drive` | Texto/URL | Livre | Ambiguo com varios casos. |

## Lacunas para painel futuro

Hoje o admin consegue operar porque le o `estado_bot_snapshot`. Como nao ha disponibilidade para criar propriedades novas no plano atual, as lacunas abaixo devem ser tratadas sem novos campos, consolidando dados no JSON do snapshot e em textos operacionais dos campos ja existentes.

| Propriedade sugerida | Tipo sugerido | Origem no bot | Utilidade |
|---|---|---|---|
| `score_emocional` | Numero | `scoreEmocional(u)` | Ordenar risco emocional. |
| `nivel_emocional` | Selecao unica | `baixo`, `medio`, `alto` | Filtro rapido de casos sensiveis. |
| `score_operacional` | Numero | `u.score` / `gerarBriefingCaso(u)` | Prioridade de atendimento. |
| `docs_status` | Selecao unica | `calcularStatusDocumentos(u)` | Painel documental. |
| `docs_faltantes_criticos` | Texto multilinha | `getDocsPendentes(u)` e status documental | Acao direta para pedir documentos. |
| `consulta_ativa` | Booleano | `_eventoCalendarId` ou stage `AGENDAMENTO` | Painel de agenda. |
| `proxima_acao` | Texto linha unica/multilinha | `gerarBriefingCaso(u).proximaAcao` | Mesa de acao. |
| `whatsapp_contato` | Texto linha unica | `getTelefoneContato(from, u)` | Link operacional sem abrir snapshot. |
| `link_hubspot` | Calculado/externo | `linkHubSpot(negocioId)` | Normalmente nao precisa criar; HubSpot ja tem URL do registro. |

## Estrategia aprovada - Fase 2 sem novos campos

Plano atual: sem upgrade HubSpot por enquanto. Nao criar novas propriedades personalizadas.

Propriedades de **Negocio** existentes e disponiveis para a fase 2:

| Grupo | Propriedades |
|---|---|
| Personalizadas ja criadas | `area_juridica`, `cidade`, `descricao_completa`, `estado_bot_snapshot`, `etapa_do_bot`, `numero_de_caso`, `origem_atendimento`, `pasta_drive`, `resumo_cliente`, `temperatura_lead`, `tipo_de_caso`, `urgencia` |
| Padrao HubSpot uteis | `dealname`, `dealstage`, `pipeline`, `description`, `closedate`, `hs_priority`, `closed_lost_reason`, `last_activity_date`, `notes_last_updated` |

Uso aprovado:

| Campo existente | Como usar na fase 2 |
|---|---|
| `estado_bot_snapshot` | JSON completo com `score_emocional`, `nivel_emocional`, `score_operacional`, `docs_status`, `docs_faltantes`, `consulta_ativa` e `proxima_acao`. |
| `resumo_cliente` | Texto curto operacional para painel: risco, documentos e proxima acao. |
| `descricao_completa` | Bloco estruturado com relato livre + situacao atual; enriquecer sem apagar o relato. |
| `urgencia` | Filtro rapido de urgencia. |
| `temperatura_lead` | Filtro rapido de prioridade comercial/operacional. |
| `hs_priority` | Sinalizador padrao do HubSpot para revisao humana. |

> Atualizacao 01/06/2026: o codigo em `server.js` agora popula `resumo_cliente`, `descricao_completa` e `estado_bot_snapshot` com metadados operacionais adicionais. Isso permite painel mais rico sem criar novas propriedades personalizadas no plano gratuito.
>
> `estado_bot_snapshot` agora carrega tambem: `score_emocional`, `nivel_emocional`, `score_operacional`, `docs_status`, `docs_faltantes`, `consulta_ativa` e `proxima_acao`.

Regra: so implementar propriedades novas se o proprietario confirmar upgrade do HubSpot.

## Recomendacao de sequencia

1. Manter as 12 propriedades existentes como base operacional do painel.
2. Na fase 2, enriquecer `estado_bot_snapshot`, `resumo_cliente`, `descricao_completa`, `urgencia`, `temperatura_lead` e `hs_priority`.
3. Nao criar propriedades novas enquanto o HubSpot estiver sem upgrade.
4. Manter os campos de Contato como apoio, sem transformar contato na fonte principal de casos, porque o projeto preserva multiplos casos por cliente.

## Observacoes de preservacao

- O fluxo de relato livre deve continuar gravando relato em `description`/`descricao_completa` e no snapshot.
- Voz/TTS nao depende dessas propriedades e nao deve ser alterado por esta auditoria.
- HubSpot/Drive continuam vinculados por `pasta_drive` e pelo snapshot.
- Multiplos casos dependem de negocios separados e `numero_de_caso` no objeto Negocio.
- Template aprovado de terceiro nao foi auditado como propriedade HubSpot porque depende de variavel de ambiente e envio WhatsApp, nao do schema HubSpot.
