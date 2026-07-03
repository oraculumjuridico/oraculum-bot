# Consultation — relatório de encerramento do ciclo arquitetural

## Escopo e significado dos status

Este documento consolida o estado do domínio Consultation ao final do ciclo arquitetural das Fases 1 a 9.

Classificações:

| Status | Significado |
|---|---|
| **IMPLEMENTADA** | capability ou regra existe no código |
| **VALIDADA** | possui testes/gates aprovados ou execução read-only comprovada |
| **NÃO VALIDADA** | existe, mas não há evidência operacional representativa |
| **ADIADA** | foi deliberadamente excluída do ciclo atual |

Uma iniciativa pode estar simultaneamente **IMPLEMENTADA** e **NÃO VALIDADA** quando o código e os testes existem, mas não há volume ou histórico de produção suficiente.

## Resumo executivo

O domínio Consultation alcançou maturidade estrutural alta:

- Calendar é a fonte operacional do estado atual;
- Deal Stage deixou de ser fonte de verdade de agenda;
- existe API pública única;
- leituras operacionais passam pelo Read Model;
- eventos são append-only e versionados;
- replay, auditoria, dossiê e verificação de integridade existem;
- drift pode ser detectado, classificado e auditado;
- há uma primeira capability de recovery restrita à sessão persistida;
- arquitetura, manifest e checksums são verificados.

O domínio ainda não alcançou maturidade operacional suficiente para watchdog ou autocorreção geral:

- a baseline auditou apenas um Deal;
- o store de integridade local observado estava ausente;
- falhas HubSpot e Calendar não são mensuráveis historicamente;
- não há tempo médio de recuperação;
- recovery de sessão não coordena memória viva e persistência;
- Calendar, HubSpot e múltiplas projeções não possuem rebuild oficial seguro.

Decisão recomendada:

> encerrar o ciclo de expansão arquitetural e manter Consultation em validação operacional pelos próximos 90 dias.

## 1. Problema original

Consulta era modelada simultaneamente em várias camadas:

- Deal Stage HubSpot;
- `_eventoCalendarId`;
- `estado_bot_snapshot`;
- sessão local;
- Google Calendar;
- regras dispersas no bot e painéis administrativos.

Isso causava:

- competição entre fontes de verdade;
- inferência de agenda por stage ou existência de ID;
- risco de múltiplos eventos ativos;
- dificuldade de cancelamento, reagendamento e retomada;
- inconsistência entre CRM, Calendar e conversa;
- ausência de histórico imutável;
- leitura direta dispersa;
- impossibilidade de reconstruir ou provar decisões.

A premissa adotada foi:

> Calendar representa o compromisso atual; Event Store representa o histórico; Read Model representa a leitura consolidada; HubSpot não controla o fluxo conversacional.

## 2. Evolução por fases

### Fase 1 — Calendar como fonte de verdade

| Iniciativa | Status | Observação |
|---|---|---|
| Centralização de estado em `obterEstadoConsulta` | **IMPLEMENTADA** | leitura primária Calendar |
| Remoção de escrita automática no stage Consulta | **IMPLEMENTADA** | stage preservado apenas como dado legado |
| Metadata `dealId`, `personId`, `contactId`, `tipoConsulta`, versão | **IMPLEMENTADA** | vínculo gravado em eventos Calendar |
| Feature flag e fallback transitório | **IMPLEMENTADA** | mecanismo de transição inicial |
| Auditoria read-only de inconsistências | **VALIDADA** | auditor executado sem exceção após estabilização |
| Migração completa da base histórica | **NÃO VALIDADA** | não há evidência de cobertura integral da produção |

Resultado: agenda deixou de depender operacionalmente do Deal Stage.

### Fase 2 — eliminação de dependências residuais

| Iniciativa | Status | Observação |
|---|---|---|
| Remoção funcional de `AGENDAMENTO` | **IMPLEMENTADA** | sem decisão operacional por stage |
| Reconciliador Calendar × sessão | **IMPLEMENTADA** | comando idempotente disponível |
| Idempotência de criação e reagendamento | **VALIDADA** | testes cobrem retry e substituição |
| Documentos condicionados ao status de consulta | **IMPLEMENTADA** | não dependem do stage legado |
| Métricas básicas de agenda | **IMPLEMENTADA** | agregação existente |
| Execução recorrente do reconciliador em produção | **NÃO VALIDADA** | não há histórico persistido de execuções |

### Fase 3 — Event Store leve

| Iniciativa | Status | Observação |
|---|---|---|
| Eventos scheduled/rescheduled/canceled/expired/completed/no-show | **IMPLEMENTADA** | JSONL append-only |
| Idempotência dos eventos | **VALIDADA** | chaves determinísticas e testes |
| Histórico e timeline | **IMPLEMENTADA** | APIs internas existentes |
| Cadeia global e por Deal | **VALIDADA** | verificação em leitura e testes |
| Cobertura histórica real do Event Store | **NÃO VALIDADA** | store observado ausente no workspace |

### Fase 4 — Read Model e enforcement

| Iniciativa | Status | Observação |
|---|---|---|
| `getConsultaView(dealId)` | **IMPLEMENTADA** | consolida estado, timeline, métricas e flags |
| Read Model como leitura operacional | **IMPLEMENTADA** | consumo centralizado |
| Guards e hard lock | **VALIDADA** | tentativas de bypass cobertas por testes |
| Auditoria automática de imports | **VALIDADA** | execução strict sem violações |
| Runtime enforcer | **IMPLEMENTADA** | bloqueio de acessos indevidos |
| Validação de comportamento sob carga real | **NÃO VALIDADA** | não há telemetria de produção |

### Fase 5 — bounded context e facade

| Iniciativa | Status | Observação |
|---|---|---|
| `consultation/index.js` como facade | **IMPLEMENTADA** | entradas públicas registradas |
| Dependency firewall | **VALIDADA** | auditoria arquitetural aprovada |
| Versionamento obrigatório de eventos | **VALIDADA** | schema v3 e testes |
| Snapshot rígido de imports | **VALIDADA** | mudanças não registradas falham |
| Ausência de bypass conhecido | **VALIDADA** | auditor atual verificou 62 arquivos |

### Fase 6 — manifest e controle de mudança

| Iniciativa | Status | Observação |
|---|---|---|
| Manifest do domínio | **IMPLEMENTADA** | versão, arquivos e checksums |
| Change control | **IMPLEMENTADA** | mudanças estruturais exigem aprovação |
| Integrity check no boot/release | **VALIDADA** | release check aprovado |
| Auditoria obrigatória strict | **VALIDADA** | sem modo warn no fluxo protegido |
| Imutabilidade contra drift estrutural | **VALIDADA** | testes de manifest e checksums |

### Fase 7 — replay e auditoria jurídica

| Iniciativa | Status | Observação |
|---|---|---|
| Replay completo e por timestamp | **IMPLEMENTADA** | reconstrução em memória |
| Decision Audit Trail | **IMPLEMENTADA** | decisões encadeadas |
| Snapshot jurídico exportável | **IMPLEMENTADA** | histórico e estado reconstruído |
| APIs de histórico e auditoria | **IMPLEMENTADA** | expostas pela facade |
| Consistência replay × Read Model | **VALIDADA** | teste específico aprovado |
| Uso jurídico em casos reais | **NÃO VALIDADA** | não houve amostra real representativa |

### Fase 8 — dossiê e prova de integridade

| Iniciativa | Status | Observação |
|---|---|---|
| Dossiê jurídico completo | **IMPLEMENTADA** | eventos, replay, decisões e proof |
| Narrativa humana | **IMPLEMENTADA** | derivada do histórico |
| Verificador de auditoria | **IMPLEMENTADA** | cadeia, replay e temporalidade |
| Legal Admissibility Mode | **IMPLEMENTADA** | exportação inválida é rejeitada |
| Determinismo do dossiê | **VALIDADA** | teste de legal proof aprovado |
| Admissibilidade judicial concreta | **NÃO VALIDADA** | depende de contexto probatório e jurídico externo |

### Fase 9 — integridade, drift e recovery controlado

| Iniciativa | Status | Observação |
|---|---|---|
| Hash determinístico SHA-256 | **VALIDADA** | ordem recursiva e campos transitórios testados |
| Self Verification Engine | **VALIDADA** | compara replay, Read Model e Calendar em testes |
| Drift Detector | **VALIDADA** | classificações e fallback cobertos |
| Evento `integrity_drift_detected` | **VALIDADA** | append-only, cadeia e Decision Audit testados |
| Auto Repair Engine | **IMPLEMENTADA** | orquestra mecanismos autorizados |
| Session Projection Recovery | **VALIDADA** | reconstrução e idempotência testadas |
| Evento `self_healed` | **VALIDADA** | só ocorre após revalidação saudável |
| Métricas read-only de integridade | **VALIDADA** | comando e agregação testados |
| Baseline operacional | **VALIDADA** | coleta real read-only executada |
| Efetividade do self-healing em produção | **NÃO VALIDADA** | zero eventos observáveis e amostra insuficiente |
| Watchdog automático | **ADIADA** | ausência de segurança e telemetria |
| Recovery geral de Calendar/HubSpot/projeções | **ADIADA** | sem capability oficial segura |

## 3. Capacidades existentes

| Capability | Status |
|---|---|
| Agendar consulta com metadata estável | **IMPLEMENTADA**, **VALIDADA** por testes |
| Reagendar sem manter múltiplos eventos ativos | **IMPLEMENTADA**, **VALIDADA** |
| Cancelar por cliente ou administrador | **IMPLEMENTADA**, **VALIDADA** por testes; operação externa ampla **NÃO VALIDADA** |
| Marcar realizada ou no-show | **IMPLEMENTADA** |
| Classificar evento expirado | **IMPLEMENTADA** |
| Reconciliar Calendar e sessão | **IMPLEMENTADA**, **VALIDADA** por testes |
| Consultar estado consolidado | **IMPLEMENTADA**, **VALIDADA** |
| Produzir timeline e histórico | **IMPLEMENTADA**, **VALIDADA** |
| Gerar métricas de consulta | **IMPLEMENTADA** |
| Exportar histórico jurídico | **IMPLEMENTADA**, **VALIDADA** |
| Exportar dossiê verificável | **IMPLEMENTADA**, **VALIDADA** |

## 4. Capacidades de integridade

| Capability | Status |
|---|---|
| Canonicalização e hash SHA-256 | **VALIDADA** |
| Hashes separados de replay, Read Model e Calendar | **VALIDADA** |
| Comparação campo a campo | **VALIDADA** |
| Classificação de drift | **VALIDADA** |
| Verificação de hash chain de eventos | **VALIDADA** |
| Verificação da cadeia de decisões | **VALIDADA** |
| Verificação temporal e de replay | **VALIDADA** |
| Manifest, checksums e release seal | **VALIDADA** |
| Detecção automática contínua em produção | **ADIADA** |
| Detecção de sessão viva × persistida | **ADIADA** |
| Checkpoint/sequence lag de projeções | **ADIADA** |

## 5. Capacidades de auditoria

| Capability | Status |
|---|---|
| Auditoria operacional Calendar/HubSpot/sessão | **VALIDADA** em execução read-only |
| Auditoria arquitetural strict | **VALIDADA** |
| Baseline rígida de imports e rotas | **VALIDADA** |
| Decision Audit Trail | **IMPLEMENTADA**, testes **VALIDADOS** |
| Evento auditável de drift | **IMPLEMENTADA**, testes **VALIDADOS** |
| Evento auditável de self-healing | **IMPLEMENTADA**, testes **VALIDADOS** |
| Snapshot e dossiê jurídico | **IMPLEMENTADA**, testes **VALIDADOS** |
| Métricas agregadas de integridade | **VALIDADA** |
| Histórico persistente de auditorias operacionais | **ADIADA** |
| Correlação única drift → repair → self-healed | **ADIADA** |
| Evidência operacional de 30/90 dias | **NÃO VALIDADA** |

## 6. Capacidades de recuperação

| Projeção | Status |
|---|---|
| Sessão persistida em `users-state.json` | **IMPLEMENTADA**, **VALIDADA** em testes |
| Sessão viva em memória | **ADIADA** |
| Read Model materializado | não existe; rebuild **ADIADO** |
| Calendar | reprojeção automática **ADIADA** |
| Metadata Calendar restrita | proposta, não implementada — **ADIADA** |
| Snapshot HubSpot | **ADIADA** |
| Métricas por replay | **ADIADA** |
| Full replay rebuild | **ADIADA** |
| Investigação manual para drift desconhecido | **IMPLEMENTADA** como política fail-closed |

Limitação crítica:

o recovery da sessão atualiza o arquivo, mas não o objeto `users` em memória. Persistência posterior pode reintroduzir o valor antigo.

## 7. Métricas atuais observadas

Baseline em 28/06/2026:

| Métrica | Valor | Classificação |
|---|---:|---|
| Deals auditados | 1 | **VALIDADA**, amostra insuficiente |
| Eventos Calendar de consulta | 0 | **VALIDADA** para a execução |
| Achados críticos | 0 | **VALIDADA** para a execução |
| Achados médios | 0 | **VALIDADA** para a execução |
| Drifts registrados | 0 no store local observável | **NÃO VALIDADA** como taxa operacional |
| Self-healings registrados | 0 no store local observável | **NÃO VALIDADA** como taxa operacional |
| Eventos de integridade | 0 no store local observável | **NÃO VALIDADA** como histórico |
| Falhas HubSpot | não mensurável | **NÃO VALIDADA** |
| Falhas Calendar | não mensurável | **NÃO VALIDADA** |
| Tempo médio de recuperação | não mensurável | **NÃO VALIDADA** |

Os zeros não comprovam ausência de incidentes. O store estava ausente e não havia logs persistentes configurados.

## 8. Riscos conhecidos

| Risco | Status |
|---|---|
| Corrida entre recovery e persistência normal | **NÃO VALIDADA** operacionalmente; risco demonstrável |
| Sessão em memória divergir do arquivo recuperado | **NÃO VALIDADA** operacionalmente; limitação confirmada no código |
| Locks apenas locais ao processo | **NÃO VALIDADA** sob múltiplas instâncias |
| Calendar indisponível parecer drift | **NÃO VALIDADA** |
| Replay e Calendar divergirem legitimamente | política incompleta — **ADIADA** |
| Event Store incompleto após sucesso Calendar e falha de append | risco conhecido, **NÃO VALIDADA** em produção |
| Decision Audit sem lock distribuído | **NÃO VALIDADA** sob concorrência |
| Eventos de drift duplicados em retry | idempotência específica **ADIADA** |
| Falha depois do repair e antes do audit | tratamento transacional **ADIADO** |
| Cobertura parcial de campos de Calendar | expansão **ADIADA** |
| Dependência de filesystem local | persistência distribuída **ADIADA** |

## 9. Riscos não confirmados

Os seguintes problemas são possíveis, mas não foram observados na baseline:

| Possibilidade | Status |
|---|---|
| múltiplos eventos ativos por Deal | **NÃO VALIDADA**; nenhum encontrado na amostra |
| snapshot ativo sem Calendar | **NÃO VALIDADA**; nenhum encontrado |
| sessão ativa sem evento | **NÃO VALIDADA**; nenhum encontrado |
| corrupção de hash chain | **NÃO VALIDADA** em produção; stores locais ausentes |
| volume relevante de drift | **NÃO VALIDADA** |
| custo operacional elevado de correções | **NÃO VALIDADA** |
| rate limit Calendar/HubSpot por auditoria | **NÃO VALIDADA** |
| degradação perceptível do fluxo Calendar-first | **NÃO VALIDADA** em escala |

Ausência de evidência não deve ser convertida em risco zero.

## 10. Itens deliberadamente adiados

| Item | Status | Motivo |
|---|---|---|
| Integrity Watchdog | **ADIADA** | telemetria e concorrência insuficientes |
| Auto repair geral | **ADIADA** | somente sessão possui recovery oficial |
| Reprojeção Calendar | **ADIADA** | Calendar é fonte operacional e o Event Store não representa tudo |
| Rebuild HubSpot snapshot | **ADIADA** | snapshot mistura responsabilidades |
| Full projection rebuild | **ADIADA** | faltam locks, checkpoints e writers idempotentes |
| Lock distribuído | **ADIADA** | não necessário para observação atual, obrigatório antes de automação |
| Correlação de reparos | **ADIADA** | deve preceder métricas de recovery confiáveis |
| Sink persistente de logs | **ADIADA**, recomendado para o próximo ciclo |
| Alertas automáticos | **ADIADA** | primeiro é preciso definir thresholds |
| Novas capabilities Consultation | **ADIADA** por 90 dias |

## 11. Recomendação para os próximos 90 dias

### Dias 1–30 — observar

| Iniciativa | Status recomendado |
|---|---|
| Executar `consultation:baseline` em periodicidade definida | **VALIDADA** após séries recorrentes |
| Executar `consultation:integrity:metrics` | **VALIDADA** após existência de store real |
| Preservar logs HubSpot e Calendar com timestamp | hoje **ADIADA**; priorizar implementação operacional fora do domínio |
| Registrar cobertura: Deals, eventos e sessões | **IMPLEMENTADA** no coletor |
| Não habilitar reparo automático | **ADIADA** deliberadamente |

### Dias 31–60 — medir e classificar

| Iniciativa | Status recomendado |
|---|---|
| Calcular taxa de drift por consulta | hoje **NÃO VALIDADA** |
| Medir falhas HubSpot/Calendar | hoje **NÃO VALIDADA** |
| Medir tempo manual de resolução | hoje **NÃO VALIDADA** |
| Revisar falsos positivos do verificador | hoje **NÃO VALIDADA** |
| Definir política Calendar versus replay | hoje **ADIADA** |

### Dias 61–90 — decidir

Continuar a Fase 9 somente se a evidência demonstrar:

- drift recorrente;
- impacto operacional relevante;
- padrão reparável com segurança;
- volume que justifique automação.

Considerar o domínio concluído se:

- Calendar-first operar sem divergência funcional relevante;
- auditorias mostrarem estabilidade;
- incidentes forem raros e resolvidos manualmente;
- custo de automação superar o benefício.

Se automação for justificada, a primeira iniciativa deve ser:

> observação automática e alerta, sem escrita.

Somente depois devem ser avaliados:

1. correlation ID;
2. lock por consulta;
3. coordenação entre sessão viva e persistida;
4. dry-run;
5. kill switch;
6. reparo restrito de `SESSION_PROJECTION_DRIFT`.

## Encerramento formal

Classificação final:

| Dimensão | Status |
|---|---|
| Arquitetura Calendar-first | **IMPLEMENTADA**, **VALIDADA** estruturalmente |
| Bounded context e facade | **IMPLEMENTADA**, **VALIDADA** |
| Event sourcing e replay | **IMPLEMENTADA**, **VALIDADA** por testes |
| Auditoria jurídica | **IMPLEMENTADA**, **VALIDADA** por testes |
| Integridade e drift | **IMPLEMENTADA**, **VALIDADA** por testes |
| Recovery de sessão | **IMPLEMENTADA**, **VALIDADA** por testes |
| Maturidade operacional em produção | **NÃO VALIDADA** |
| Watchdog e autocorreção geral | **ADIADA** |

O ciclo arquitetural atual pode ser formalmente encerrado como:

> implementação estrutural concluída; validação operacional em observação; expansão automática adiada.
