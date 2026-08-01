# Matriz de aceitação

`Condicional` significa que a escrita externa só ocorre quando a integração está configurada e retorna identificador verificável. Propriedades não existentes no contrato oficial não são inventadas: o valor é preservado na descrição estruturada/snapshot do Negócio.

## WhatsApp Admin

| Requisito | Implementado | Arquivo | Teste | Evidência | Pendência |
|---|---|---|---|---|---|
| Menu Prioridades | Sim | `server.js` | `admin-menu-ux.test.js` | `ADMIN_IDS.prioridades` | Nenhuma |
| Novo atendimento assistido | Sim | `admin-assisted-ai-flow.js` | `admin-assisted-ai-flow.test.js` | início, coleta, revisão e finalização | Nenhuma |
| Consultar caso | Sim | `server.js`, `admin-case-operations.js` | `admin-case-operations.test.js`, `admin-whatsapp-complete-routes.test.js` | protocolo, nome, CPF e telefone | Fonte real somente em runtime autenticado |
| Completar informações | Sim | mesmos | mesmos | um campo por operação, IDs preservados | Escrita externa não executada localmente |
| Enviar documentos | Sim | `server.js`, `admin-assisted-media.js` | `admin-assisted-media-security.test.js` | caso selecionado e `caseFolderId` | Escrita externa não executada localmente |
| Agendar atendimento | Condicional | `server.js`, `admin-case-operations.js` | `admin-case-operations.test.js` | confirma somente com `eventId` | Sem credenciais vira pendência humana |
| Ver pendências | Sim | `server.js`, `admin-case-ui.js` | `admin-menu-ux.test.js` | Alertas, prioridades e documentos faltantes | Nenhuma |
| Voltar e cancelar | Sim | `admin-assisted-ai-flow.js`, `server.js` | `admin-assisted-ai-flow.test.js` | handlers canônicos de navegação | Nenhuma |
| Edição de um único campo | Sim | `admin-assisted-ai-flow.js`, `admin-case-operations.js` | `admin-case-operations.test.js` | patch unitário | Nenhuma |
| Preservação dos demais campos | Sim | `admin-case-operations.js` | `admin-case-operations.test.js` | comparação before/after | Nenhuma |
| Texto e botão Confirmar no mesmo handler | Sim | `admin-assisted-ai-flow.js` | `admin-assisted-complete-flow.test.js` | `acaoRevisaoAdminAssistido` | Nenhuma |
| Mensagens curtas sem duplicação | Sim | fluxo e telas declarativas | `admin-menu-ux.test.js`, `admin-assisted-ai-flow.test.js` | uma resposta por transição | Nenhuma |
| Perguntas sem repetição e progresso | Sim | `admin-assisted-questionnaire.js` | `admin-assisted-complete-flow.test.js` | `perguntados`, Etapa X de Y | Nenhuma |
| Obrigatórios e opcionais | Sim | `admin-assisted-ai-schema.js` | `admin-assisted-complete-flow.test.js` | matriz por área | Ausências não críticas permanecem explícitas |
| Texto e áudio no mesmo estado | Sim | `admin-assisted-ai-flow.js`, `server.js` | `admin-assisted-ai-flow.test.js`, `admin-assisted-ai-static.test.js` | áudio transcrito retorna ao mesmo processador | Nenhuma |

## HubSpot e identidade

| Requisito | Implementado | Arquivo | Teste | Evidência | Pendência |
|---|---|---|---|---|---|
| Contato=pessoa; Negócio=caso | Sim | `live-case-executor-bridge.js` | `admin-assisted-acceptance-contracts.test.js` | adapters separados | Nenhuma |
| Um Contato, vários Negócios | Sim | mesmo | mesmo | `_novoCasoDeCliente` não consulta negócio anterior | Nenhuma |
| Associação Contato–Negócio correta | Sim | mesmo | mesmo, `hubspot-single-case-adapter.test.js` | IDs esperados na associação | Nenhuma |
| Admin nunca vira Contato | Sim | `admin-assisted-ai-flow.js` | `placeholder-reproduction.test.js` | `whatsappContato` vem do cliente | Nenhuma |
| CPF antes do telefone | Sim | `hubspot-core.js`, `live-case-executor-bridge.js`, `server.js` | `admin-assisted-acceptance-contracts.test.js` | canônico+legado, telefone só como fallback | Nenhuma |
| Telefone cliente separado do admin | Sim | fluxo | `placeholder-reproduction.test.js` | teste de terceiro | Nenhuma |
| Contato genérico incompatível não reutilizado | Sim | bridge e fallback | `admin-assisted-acceptance-contracts.test.js` | `HUBSPOT_PHONE_IDENTITY_CONFLICT` | Nenhuma |
| Não criar duplicidade | Sim | busca CPF/telefone e checkpoint | testes acceptance, adapter e executor | deduplicação por ID e retomada | Ambiguidade exige revisão |
| Preencher propriedades existentes aplicáveis | Sim | `hubspot-core.js`, `hubspot-contract.js` | `hubspot-contract.test.js`, acceptance | allowlist baseada em export oficial | Nenhuma |
| Ausência não apaga valor | Sim | `montarPropsAusentesContatoHubSpot` | `hubspot-contract.test.js`, `admin-case-operations.test.js` | somente vazios recebem patch automático | Nenhuma |
| Dado inválido não é escrito | Sim | contratos/schema | testes CPF, placeholder e HubSpot | validação antes do adapter | Nenhuma |
| Dado sem propriedade é preservado | Sim | descrição estruturada e snapshot | acceptance | campos expandidos presentes em `descricao` | Nenhuma |
| Nenhum dado válido descartado silenciosamente | Sim | schema + resumo | acceptance | todos os campos declarados roteados | Propriedade dedicada depende do portal |

## Propriedades do Contato

| Requisito | Implementado | Arquivo | Teste | Evidência | Pendência |
|---|---|---|---|---|---|
| Nome completo / firstname / lastname | Sim | `hubspot-core.js` | acceptance, `hubspot-contract.test.js` | separação determinística | Nenhuma |
| Telefone / WhatsApp | Sim | mesmo | acceptance, `contact-verification-normalization.test.js` | `phone` e `mobilephone` | Nenhuma |
| E-mail | Sim | mesmo | `email-validation-blocker.test.js` | `email`/`work_email`, validado | Nenhuma |
| CPF | Sim | mesmo | acceptance e adapter | `cpf_do_cliente`, 11 dígitos | Nenhuma |
| Data de nascimento exata | Sim | mesmo | `admin-assisted-complete-flow.test.js` | `date_of_birth`, sem estimativa | Nenhuma |
| Idade | Via resumo | `admin-assisted-ai-flow.js` | mesmo | “Idade informada” | Sem propriedade dedicada confirmada |
| Estado civil / profissão / situação profissional | Via resumo | fluxo/schema | acceptance | descrição estruturada | Sem propriedades dedicadas confirmadas |
| Endereço / número / complemento / bairro | Sim | `hubspot-core.js` | acceptance | composição segura em `address` | Campos separados não existem no contrato |
| Cidade / estado / CEP | Sim | mesmo | acceptance | `city`, `state`, `zip` | Nenhuma |
| Apelido | Via resumo | fluxo/schema | acceptance estrutural | preservado na descrição | Sem propriedade dedicada confirmada |
| Origem | Sim | `hubspot-core.js` | `hubspot-contract.test.js` | `origem_lead` | Nenhuma |
| Observações permanentes | Via resumo/snapshot | fluxo e deal state | acceptance | não inventa propriedade | Sem propriedade dedicada confirmada |

## Propriedades do Negócio

| Requisito | Implementado | Arquivo | Teste | Evidência | Pendência |
|---|---|---|---|---|---|
| Número interno e nome | Sim | `hubspot-core.js`, `hubspot-deal-title.js` | `hubspot-deal-title.test.js` | `numero_de_caso`, `dealname` | Nenhuma |
| Área, tipo e natureza | Sim | deal state + descrição | `hubspot-contract.test.js`, acceptance | área/tipo dedicados; natureza estruturada | Natureza sem propriedade dedicada |
| Resumo e descrição estruturada | Sim | `server.js` | `hubspot-contract.test.js`, acceptance | `resumo_cliente`, `descricao_completa` | Nenhuma |
| Situação atual e objetivo | Sim | snapshot/descrição | acceptance | preservados sem descarte | Situação possui também propriedade no Contato legado |
| Cidade e data do atendimento | Sim | deal state/snapshot | acceptance | `cidade`, `dataAtendimento` | Data sem propriedade dedicada confirmada |
| Responsável | Sim | `hubspot-core.js` | `hubspot-contract.test.js` | `hubspot_owner_id` existente | Configuração atual do escritório |
| Prioridade | Sim | deal state | testes lead temperature/HubSpot | `hs_priority`, `urgencia` | Nenhuma |
| Status documental e pendências | Sim | contrato `oraculum_*` | testes document HubSpot/post-human | propriedades gerenciadas | Nenhuma |
| Acidente, limitações, situação profissional, vínculo | Via descrição/snapshot | fluxo/schema | acceptance | rótulos estruturados | Sem propriedades dedicadas confirmadas |
| Composição familiar, renda, benefício | Sim/parcial | fluxo + contrato | acceptance/HubSpot | benefício dedicado; demais no resumo | Sem propriedades dedicadas para composição/renda |
| Requerimento, indeferimento e perícia | Via descrição/snapshot | fluxo/schema | acceptance | datas/resultado preservados | Sem propriedades dedicadas confirmadas |
| Órgão e conflito | Via descrição/snapshot | fluxo/schema | acceptance | campos declarados | Sem propriedades dedicadas confirmadas |
| Origem | Sim | deal state | `hubspot-contract.test.js` | `origem_atendimento` | Nenhuma |

## Documentos

| Requisito | Implementado | Arquivo | Teste | Evidência | Pendência |
|---|---|---|---|---|---|
| Envio após criação | Sim | fluxo + staging | `admin-assisted-complete-flow.test.js` | caso antes de documento | Nenhuma |
| Envio posterior/menu/complementação | Sim | `server.js` | media security + routes | ação selecionada aceita mídia | Nenhuma |
| Seleção e pasta correta | Sim | server/media | media security | `ADMIN_MEDIA_CASE_REQUIRED`, folder assert | Nenhuma |
| PDF/JPEG/PNG, MIME, extensão, limite | Sim | media | media security | allowlist e `maxBytes` | Nenhuma |
| Nome seguro, hash/mediaId, categoria | Sim | media | media security/media | metadados do staging | Nenhuma |
| Deduplicação e retomada | Sim | media + `_canonicalDocuments` | media security | SHA-256 e fileId anterior | Nenhuma |
| ID real antes do sucesso | Sim | media | media security | `ADMIN_MEDIA_UPLOAD_VERIFY_FAILED` | Nenhuma |
| Falha sem confirmação | Sim | server/media | media security/routes | mensagem de falha | Nenhuma |
| Não pedir documento recebido | Sim | `documents-core.js` | `document-checklist.test.js` | status por documento | Nenhuma |
| Logs sem conteúdo | Sim | logging/media handler | `admin-security-logging.test.js`, media tests | somente código técnico | Nenhuma |

## Consulta, agenda, pós-atendimento, contrato e logs

| Requisito | Implementado | Arquivo | Teste | Evidência | Pendência |
|---|---|---|---|---|---|
| Consulta protocolo/nome/CPF/telefone mascarada | Sim | admin case operations | teste homônimo | somente resultados correspondentes | Nenhuma |
| Seleção para múltiplos Negócios e isolamento | Sim | server + search | `admin-case-operations.test.js` | lista de resultados, sem outro cliente | Nenhuma |
| Campos faltantes, atualização, histórico, sem duplicação | Sim | questionnaire/operations | testes complete/operations | patch e `adminUpdateHistory` | Nenhuma |
| Agenda só configurada; eventId obrigatório | Sim | operations/server | operations | pendência sem ID | Nenhuma |
| Mensagem de indisponibilidade | Sim | server | routes/operations | texto exigido | Nenhuma |
| Marcar atendido e complementar | Sim | post-human modules | `test:post-human` | ciclo idempotente | Feature flag/allowlist fechadas por padrão |
| Registrar observação | Sim | ações Admin/HubSpot notes | testes post-human/HubSpot | nota segura | Nenhuma |
| Pedir somente campos/docs faltantes | Sim | post-human resolver/checklist | suíte post-human | solicitação unitária | Nenhuma |
| Consultar status | Sim | telas de caso/consulta | testes consultation/menu | read models | Nenhuma |
| Reengajamento desligado; sem template em testes | Sim | feature flags | `post-human-feature-flag.test.js`, `post-human-server-flag-off.test.js` | fail closed | Nenhuma |
| Quatro IDs e associação no sucesso | Sim | flow/executor | acceptance | teste de ausência individual + association | Nenhuma |
| Evento final técnico completo | Sim | flow | acceptance | executionId, status, etapa, IDs, ações, duração | Nenhuma |
| Logs sem PII/credencial/documento | Sim | flow/logging | flow, HubSpot logging, post-human safe log | allowlist técnica | Nenhuma |
