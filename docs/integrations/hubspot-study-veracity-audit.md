# Auditoria de veracidade — limites e disponibilidade HubSpot

**Data de verificação:** 28 de junho de 2026
**Escopo:** validação das afirmações comerciais e técnicas associadas ao estudo `hubspot-bot-data-mapping.md` e ao documento legado `docs/integrations/auditoria-hubspot.md`.

## 1. Método e ressalvas

Esta não é uma nova auditoria do código. A análise preserva o inventário técnico anterior e verifica apenas afirmações que dependem das regras do produto HubSpot.

Ordem de evidência:

1. Product & Services Catalog;
2. HubSpot Developers;
3. HubSpot Knowledge Base;
4. HubSpot Community somente como apoio.

O catálogo é dinâmico. Limites atuais podem não ser aplicados de forma idêntica a contas legadas, trials, developer test accounts ou contas com mais de um produto contratado. Quando a documentação diz que prevalece a maior assinatura da conta, isso está indicado.

## 2. Resultado executivo

As correções mais importantes são:

- O Free atual comporta **até 1.000 Contacts**, não um milhão.
- Para **Deals e outros objetos padrão**, o teto geral do Free é **até 1 milhão de registros por tipo de objeto**.
- O Free dispõe de **10 propriedades personalizadas no total da conta**, não 10 por objeto.
- O Free dispõe de **1 pipeline de Deals**.
- A regra de **30 dias não apaga atividades** e não se aplica universalmente: ela limita a exibição de certas atividades na timeline de contas Free criadas em ou após 4 de fevereiro de 2025. Notes e Tasks são exceções.
- Private Apps estão disponíveis em contas Free, com limite atual de **20 legacy private apps por conta**.
- O limite geral para Private Apps em Free/Starter é **100 chamadas por 10 segundos por app** e **250.000 chamadas diárias compartilhadas pela conta**.
- O Free atual inclui **10 dashboards, com até 50 relatórios por dashboard**.

## 3. Validação detalhada

### 3.1 Limite de Contacts no HubSpot Free

**Status: ✅ Confirmada — limite atual de 1.000 Contacts.**

**Evidência:** o [HubSpot Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) informa, em “Additional Limits of Free Tools”, até 1.000 contatos em contas gratuitas.

**Explicação técnica:** este é o limite de registros do objeto Contact na edição Free atual. Não deve ser confundido com contatos de marketing incluídos em assinaturas pagas nem com o limite técnico de até 15 milhões aplicável a determinados produtos pagos.

**Mudança recente:** a documentação atual é mais restritiva que materiais históricos que apresentavam o CRM gratuito com capacidade muito superior. A fonte oficial consultada não fornece, na mesma página, a data exata de migração para 1.000.

**Dependências:** depende da assinatura. Uma conta com produto pago pode herdar limite superior. O FAQ do catálogo afirma que, havendo Marketing Hub, prevalece o limite maior, sujeito à cobrança e às regras de marketing contacts.

**Impacto no bot:** é o limite comercial mais provável de crescimento. Um Contact por número de WhatsApp pode alcançar o teto antes dos Deals.

### 3.2 Limite de Deals

**Status: ✅ Confirmada — até 1 milhão de Deals no Free.**

**Evidência:** o [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) permite até 1 milhão de registros para cada outro tipo de objeto padrão em contas Free. Deals são listados como objeto disponível no Free.

**Explicação técnica:** a formulação oficial é “up to 1 million records for all other standard object types per account”. A interpretação correta é teto por tipo de objeto padrão, não um milhão somando todos os tipos.

**Mudança recente:** não foi localizada data oficial de alteração.

**Dependências:** produtos pagos podem ter limite de 15 milhões e add-on de aumento. O limite real da conta pode ser consultado pela [Limits Tracking API](https://developers.hubspot.com/docs/api-reference/latest/crm/limits-tracking/guide).

**Impacto no bot:** o volume de Deals não é, hoje, o gargalo previsível; Contacts e propriedades personalizadas são mais restritivos.

### 3.3 Propriedades personalizadas

**Status: ✅ Confirmada — são 10 no total da conta Free, não 10 por objeto.**

**Evidência:** o [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog), na funcionalidade “Custom properties” dos Free Tools, diz literalmente “10 custom properties in total”. A [Knowledge Base sobre propriedades](https://knowledge.hubspot.com/properties/create-and-edit-properties) confirma que, após downgrade, propriedades existentes continuam visíveis/editáveis, mas novas não podem ser criadas quando a conta já excede o limite.

**Explicação técnica:** o orçamento é compartilhado entre os objetos suportados. Portanto, 12 propriedades de Deal já ultrapassam o limite do Free mesmo que não existam propriedades customizadas em Contact.

**Mudança recente:** há respostas contraditórias antigas na Community falando em “por objeto”. A fonte normativa atual elimina a ambiguidade: é total.

**Dependências:** Smart CRM e Hubs pagos incluem 1.000 propriedades por objeto. O add-on de aumento só está disponível para Professional e Enterprise, chegando a até 3.000 por objeto.

**Impacto no bot:** confirma a restrição registrada em `docs/integrations/auditoria-hubspot.md`. O portal com 22 de 10 está em estado legado permitido: pode usar/editar as existentes, mas não criar novas.

### 3.4 Pipelines

**Status: ✅ Confirmada — 1 pipeline de Deals no Free.**

**Evidência:** o [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) lista “1 deal pipeline per account” para Free Tools.

**Explicação técnica:** stages dentro desse pipeline não equivalem a pipelines adicionais. Smart CRM Starter oferece até 2; Professional, 15; Enterprise, 100.

**Mudança recente:** não confirmada.

**Dependências:** maior edição contratada pode elevar o limite.

**Impacto no bot:** a constante `pipeline: "default"` é coerente com o Free. Criar pipeline jurídico separado exigiria plano compatível.

### 3.5 Notes, Tasks e Activities

**Status: ⚠️ Parcialmente correta — não há um pequeno limite específico documentado para Notes/Tasks, mas há limites de registros e de exibição.**

**Evidência:** o [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) inclui “Tasks & activities” no Free e estabelece até 1 milhão de registros para outros objetos padrão. A [Knowledge Base de timelines](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline) trata Notes, Tasks, Meetings, Calls e Emails como atividades e descreve as regras de exibição.

**Explicação técnica:** não foi encontrada fonte oficial que diga “Notes ilimitadas” ou estabeleça um teto independente menor. A conclusão segura é que elas são suportadas, sujeitas aos limites gerais de objetos, associações e produto. O catálogo ainda registra limite técnico de 30.000 atividades de atualização de perfil de Contact, que não equivale ao total de Notes.

**Mudança recente:** a apresentação e indexação de atividades mudou para contas Free novas em 2025.

**Dependências:** associação de atividades e visibilidade podem variar por assinatura.

**Impacto no bot:** o bot pode continuar criando Notes, mas deve monitorar volume e não tratar “sem limite conhecido” como “ilimitado”.

### 3.6 Limitação de 30 dias na timeline

**Status: ⚠️ Parcialmente correta.**

**Evidência:** a [Knowledge Base oficial](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline), atualizada em 13 de abril de 2026, afirma:

- contas Free criadas em ou após **4 de fevereiro de 2025** mostram, na timeline/cards do registro, somente certas atividades dos últimos 30 dias;
- **Notes, Tasks, atividade fixada e atividades abertas por link direto são exceções**;
- atividades anteriores continuam acessíveis nas páginas de índice;
- Starter, Professional e Enterprise exibem atividades com mais de 30 dias na timeline.

**Explicação técnica:** é uma limitação de visualização, não retenção nem deleção. Dizer “a timeline só guarda 30 dias” é incorreto.

**Mudança recente:** sim, aplica-se explicitamente a contas Free criadas desde 4 de fevereiro de 2025.

**Dependências:** data de criação do portal e assinatura.

**Impacto no bot:** as Notes jurídicas do bot não desaparecem por essa regra. Outras atividades antigas podem não aparecer diretamente no cartão do registro Free novo, afetando operadores, não a escrita API.

### 3.7 Limites da API REST

**Status: ✅ Confirmada, com atualização de números.**

**Evidência:** [API usage guidelines and limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines).

Para apps privados/privately distributed:

| Tier | Burst | Diário |
|---|---:|---:|
| Free e Starter | 100 por app / 10 s | 250.000 por conta |
| Professional | 190 por app / 10 s | 625.000 por conta |
| Enterprise | 190 por app / 10 s | 1.000.000 por conta |

Apps OAuth públicos/distribuídos têm 110 requisições por 10 segundos por conta instalada, excluída a Search API.

**Explicação técnica:** o burst é por app; o diário é compartilhado pelos apps privados da conta. Endpoints como Search, Associations, Exports e GraphQL possuem limites próprios. Excesso gera HTTP `429`.

**Mudança recente:** sim. A página foi modificada em 30 de março de 2026 e distingue as versões 2025.2/2026.03 da plataforma.

**Dependências:** tier, modelo de distribuição/autenticação, endpoint e compra de API Limit Increase.

**Impacto no bot:** o padrão atual de PATCHs completos e múltiplas chamadas para criar/associar Notes deve usar throttling, retry com backoff, batches quando possíveis e medição dos headers.

### 3.8 Webhooks API

**Status: ✅ Confirmada, com distinção entre modelo atual e legado.**

**Evidência:** [Webhooks API guide](https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide), [legacy Webhooks guide](https://developers.hubspot.com/docs/api-reference/legacy/webhooks/guide) e [API usage guidelines](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines).

Limites documentados:

- até 1.000 subscriptions por app;
- concorrência padrão/máxima de envio de 10 requisições em voo por conta instalada;
- até 100 eventos por request;
- entregas webhook não consomem o rate limit REST;
- no modelo legado, timeout acima de 5 segundos ou erro 4xx/5xx gera até 10 retries distribuídos por até 24 horas.

**Explicação técnica:** em Private Apps, webhooks são suportados, mas as subscriptions são configuradas na interface do app, não programaticamente pela Webhooks API.

**Mudança recente:** a documentação atual contempla a plataforma 2026.03. Configurações podem levar até cinco minutos para surtir efeito.

**Dependências:** tipo/versão do app. Timeline Events customizados continuam não suportados por legacy Private Apps.

**Impacto no bot:** webhooks podem reduzir polling sem consumir a cota REST, mas o endpoint deve ser idempotente e aceitar batches/retries.

### 3.9 Private Apps no Free

**Status: ✅ Confirmada.**

**Evidência:** a documentação [Private Apps](https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview) inclui explicitamente os limites “Free and Starter” e explica a criação dentro de uma conta HubSpot. A versão em português também está em [Aplicativos privados](https://br.developers.hubspot.com/docs/guides/apps/private-apps/overview).

**Explicação técnica:** um Super Admin cria o app, escolhe scopes e obtém token estático. O acesso efetivo depende de o recurso/API existir no tier da conta.

**Mudança recente:** a plataforma está migrando a terminologia para apps privately distributed/static token; legacy private apps permanecem documentados.

**Dependências:** permissões de Super Admin e scopes disponíveis no plano.

**Impacto no bot:** o uso de `HUBSPOT_TOKEN` é compatível com o Free. O token deve ser rotacionado e mantido fora do código.

### 3.10 Quantidade máxima de Private Apps

**Status: ✅ Confirmada — 20 legacy Private Apps por conta.**

**Evidência:** [API usage guidelines](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines) e [Private Apps](https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview).

**Explicação técnica:** o número se refere a legacy private apps. Apps da plataforma nova possuem modelos de distribuição e instalação diferentes; um static token app instala em uma conta padrão por vez.

**Mudança recente:** a distinção entre apps legados e plataforma 2025.2/2026.03 é recente.

**Dependências:** tipo de app, não região.

**Impacto no bot:** não é gargalo para uma integração única. Separar tráfego em muitos apps não aumenta o limite diário compartilhado.

### 3.11 Dashboards e relatórios

**Status: ✅ Confirmada — Free com 10 dashboards e 50 reports por dashboard.**

**Evidência:** [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog), seção “Reporting dashboard” de Free Tools; a [Knowledge Base de dashboards](https://knowledge.hubspot.com/dashboards/manage-your-dashboards) confirma que prevalece o maior tier da conta.

**Explicação técnica:** “50 por dashboard” não significa necessariamente 500 relatórios customizados livres. O Free não inclui o construtor avançado de custom reports dos tiers superiores; depende dos relatórios e fontes disponíveis no Free.

**Mudança recente:** o número atual difere de materiais antigos com limites menores. Não foi localizada data oficial única da alteração.

**Dependências:** maior assinatura ativa na conta e recursos de reporting de cada Hub.

**Impacto no bot:** há espaço para dashboards operacionais básicos, mas os dados precisam existir em propriedades reportáveis; JSON em `estado_bot_snapshot` não vira dimensão automaticamente.

### 3.12 Arquivos e Documents

**Status: ✅ Confirmada, com distinção obrigatória entre Files e Documents.**

**Evidência:** [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) e [Supported file types and sizes](https://knowledge.hubspot.com/files/supported-file-types).

- **Sales Documents no Free:** até 5 documentos por conta, com branding HubSpot.
- **Documents nos tiers pagos de Sales Hub:** até 5.000 por conta.
- **Files tool no Free:** até 20 MB por arquivo.
- **Files tool pago:** até 2 GB por arquivo.
- **Documents:** tamanho máximo de arquivo de 250 MB.
- Free não aceita executáveis no Files tool.

**Explicação técnica:** “Documents” é a biblioteca comercial rastreável; “Files” é o gerenciador de arquivos. Não há uma única cota que represente ambos.

**Mudança recente:** artigo de tamanhos atualizado em 25 de março de 2026.

**Dependências:** tier e ferramenta; certos recursos de pagamentos e armazenamento também variam por região.

**Impacto no bot:** reforça a decisão de manter PDFs, áudios e documentos jurídicos no Google Drive. HubSpot deve guardar links/metadados, não substituir o Drive.

### 3.13 Recursos indisponíveis ou limitados no Free

**Status: ⚠️ Parcialmente confirmada — a lista precisa ser tratada por feature, não como bloqueio geral.**

**Evidência:** [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) e [APIs by tier](https://developers.hubspot.com/docs/developer-tooling/platform/apis-by-tier).

Entre as limitações relevantes ao bot:

- 2 usuários Free;
- 1 pipeline de Deals;
- 10 propriedades customizadas no total;
- 1 shared inbox;
- 5 Documents;
- 1 meeting link pessoal;
- bots sem branching customizado;
- custom reporting avançado não incluído;
- workflows e automações avançadas dependem de produto/tier;
- custom objects são recurso Enterprise;
- calculated properties, association labels avançados, sandboxes, permissões por campo e equipes avançadas são pagos;
- custom Timeline Events não são suportados por legacy Private Apps.

**Explicação técnica:** APIs abertas não concedem acesso a recursos que a conta não possui. Um Private App Free pode chamar APIs autorizadas do CRM, mas não desbloqueia objetos ou features premium.

**Mudança recente:** packaging muda com frequência e a página “APIs by tier” foi modificada em 29 de abril de 2026.

**Dependências:** produto, tier, seat, região e, em alguns casos, data/contrato legado.

**Impacto no bot:** a arquitetura deve depender somente de Contacts, Deals, Notes, associações e propriedades já existentes; workflows avançados e objetos customizados não podem ser pressupostos.

### 3.14 Recursos que se tornaram gratuitos recentemente

**Status: ❓ Não foi possível confirmar uma lista histórica completa com datas oficiais.**

**Evidência atual:** o [Product & Services Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) inclui hoje no Free, entre outros:

- 10 dashboards com 50 relatórios cada;
- App Objects;
- Projects com 1 pipeline;
- até 10 custom tabs na interface padrão;
- segment analytics/filter insights em beta;
- conversational context limitado a 25 registros por mês;
- credit memos;
- Private Apps/API CRM, já documentadas para Free.

**Explicação técnica:** a presença atual no Free está confirmada. Sem um catálogo versionado por feature ou changelog com data de liberação, não é seguro afirmar que cada item “passou a ser gratuito recentemente”.

**Mudança recente confirmável:** a limitação de 30 dias por data de criação da conta entrou no recorte de 4 de fevereiro de 2025; a plataforma de apps e os limites API foram revisados em 2026. Isso não equivale a uma expansão geral do Free.

**Dependências:** betas podem exigir opt-in, rollout gradual ou região elegível.

**Impacto no bot:** não projetar dependência sobre recurso “novo no Free” sem verificar a tela **Usage & Limits** do portal e os scopes do app.

## 4. Auditoria das afirmações do estudo anterior

| Afirmação | Veredito | Justificativa |
|---|---|---|
| O bot pode usar Contacts, Deals e Notes no Free | ✅ Confirmada | Os objetos e Tasks/Activities constam nos Free Tools. |
| O portal está limitado a 10 propriedades customizadas | ✅ Confirmada | O catálogo atual diz 10 no total. |
| São 10 propriedades por objeto | ❌ Incorreta | A regra atual é 10 no total da conta Free. |
| 22 de 10 impede criar novas propriedades, mas mantém existentes | ✅ Confirmada | A KB permite ver/editar as existentes após downgrade e bloqueia criação acima do limite. O número 22 depende da observação do portal. |
| Deals seriam fortemente limitados no Free | ❌ Incorreta | O teto atual é até 1 milhão por tipo de objeto padrão. |
| Toda timeline do Free guarda apenas 30 dias | ❌ Incorreta | É restrição de exibição para contas novas, com exceções, e não retenção. |
| Notes antigas deixam de existir após 30 dias | ❌ Incorreta | Notes são exceção explícita. |
| Private Apps exigem plano pago | ❌ Incorreta | Free/Starter possuem limites oficiais de Private Apps e API. |
| API Free é pequena demais para integração operacional | ⚠️ Parcial | 250 mil/dia é amplo; burst, Search e padrões redundantes ainda exigem controle. |
| HubSpot deve armazenar arquivos jurídicos | ⚠️ Parcial | Pode armazenar Files, mas limites, segurança e Documents tornam Drive mais apropriado ao desenho atual. |
| Free oferece somente dashboards muito limitados | ⚠️ Parcial | O atual oferece 10 × 50, mas custom reporting avançado continua pago. |

## 5. Tabela consolidada

| Informação | Situação | Fonte oficial | Impacto para a arquitetura do bot |
|---|---|---|---|
| 1.000 Contacts no Free | Confirmada | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Planejar arquivamento/upgrade antes do teto |
| Até 1 milhão de Deals | Confirmada | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Não é o gargalo imediato |
| 10 custom properties no total | Confirmada | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Reutilizar campos; não criar novos sem upgrade |
| 10 custom properties por objeto | Incorreta | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Corrigir qualquer planejamento baseado nisso |
| 1 Deal pipeline no Free | Confirmada | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Manter `default`; não pressupor pipeline separado |
| Notes/Tasks “ilimitadas” | Não confirmada | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Medir volume e consultar Limits Tracking |
| Timeline limitada a 30 dias | Parcial | [Timeline KB](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline) | Impacta UI de contas Free novas, não Notes nem retenção |
| REST API Free: 100/10s/app e 250k/dia/conta | Confirmada | [Developer limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines) | Implementar throttling, retry e métricas |
| Webhooks: 1.000 subscriptions/app | Confirmada | [Webhooks guide](https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide) | Permite reduzir polling |
| Webhooks: 10 requests concorrentes e 100 eventos/request | Confirmada | [Webhooks guide](https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide) | Endpoint deve processar batch e ser idempotente |
| Private Apps disponíveis no Free | Confirmada | [Private Apps](https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview) | Token atual é suportado |
| 20 legacy Private Apps | Confirmada | [Developer limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines) | Sem impacto imediato; diário continua compartilhado |
| Free: 10 dashboards × 50 reports | Confirmada | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Viabiliza painel básico com propriedades estruturadas |
| Free: 5 Sales Documents | Confirmada | [Product Catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Não usar como acervo jurídico |
| Files Free: 20 MB por arquivo | Confirmada | [Files KB](https://knowledge.hubspot.com/files/supported-file-types) | Manter Drive como storage binário |
| Lista completa de features recém-gratuitas | Não confirmada | [Product Catalog atual](https://legal.hubspot.com/hubspot-product-and-services-catalog) | Validar feature por feature no portal |

## 6. Conclusão arquitetural

O estudo técnico do que o bot envia permanece válido. As correções atingem principalmente premissas comerciais:

1. O limite de 10 propriedades é mais restritivo do que “por objeto”: ele é compartilhado.
2. O limite de Contacts é muito mais relevante que o de Deals.
3. Notes não são eliminadas pela regra de 30 dias.
4. Private App e API REST são plenamente utilizáveis no Free, dentro das cotas.
5. Drive continua sendo a escolha mais segura para binários jurídicos.

Antes de qualquer desenho definitivo, deve-se consultar no portal **Settings → Usage & Limits** ou a Limits Tracking API. Essa leitura da conta é a única forma de conciliar catálogo atual, eventuais direitos legados e o consumo real do portal Oráculum.
