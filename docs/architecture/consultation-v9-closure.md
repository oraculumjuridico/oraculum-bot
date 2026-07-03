# Marco de encerramento arquitetural — Consultation v9

## 1. Escopo original

Consultation v9 foi iniciado para eliminar a fragmentação do estado de consultas entre:

- Google Calendar;
- Deal Stage do HubSpot;
- propriedades e snapshot do Deal;
- sessão local do bot;
- identificadores de evento;
- regras dispersas nos fluxos operacionais.

O objetivo central foi estabelecer:

- Calendar como fonte do estado atual da agenda;
- Deal como representação do caso jurídico;
- Event Store como histórico imutável;
- Read Model como leitura consolidada;
- fronteira arquitetural única para o domínio;
- integridade, replay e auditoria verificáveis.

## 2. Capacidades entregues

### Agenda Calendar-first

- agendamento;
- cancelamento;
- reagendamento;
- conclusão e no-show;
- expiração;
- metadata estável;
- idempotência;
- reconciliação.

### Leitura e domínio

- Consultation Read Model;
- facade pública única;
- dependency firewall;
- guards e runtime enforcement;
- auditoria automatizada de dependências;
- bloqueio de bypass.

### Histórico e auditoria

- Event Store append-only;
- eventos versionados;
- timeline e histórico;
- replay completo e por timestamp;
- Decision Audit Trail;
- snapshot jurídico;
- narrativa;
- dossiê e proof de integridade.

### Governança

- manifest do domínio;
- checksums;
- change control;
- release check;
- baseline arquitetural;
- testes de imutabilidade.

### Integridade

- hashing determinístico;
- Self Verification Engine;
- Drift Detector;
- evento `consultation.integrity_drift_detected`;
- Auto Repair Engine controlado;
- recovery da sessão persistida;
- evento `consultation.self_healed`;
- métricas e baseline read-only.

## 3. Capacidades adiadas

Foram deliberadamente adiados:

- Integrity Watchdog;
- autocorreção geral;
- recovery da sessão viva em memória;
- reprojeção automática do Calendar;
- recovery do snapshot HubSpot;
- rebuild integral de projeções;
- lock distribuído;
- correlation ID de reparos;
- alertas automáticos;
- novas capabilities sem evidência operacional.

Esses itens não fazem parte do escopo encerrado de Consultation v9.

## 4. Estado atual do domínio

| Dimensão | Estado |
|---|---|
| Calendar-first | concluído e validado estruturalmente |
| Read Model e facade | concluídos e validados |
| Event Store e replay | concluídos e validados por testes |
| Auditoria jurídica | concluída e validada por testes |
| Integridade e drift | concluídos e validados por testes |
| Recovery da sessão persistida | concluído e validado por testes |
| Estabilidade em escala real | em observação |
| Watchdog e auto repair geral | adiados |

Baseline observada:

- 1 Deal auditado;
- 0 eventos Calendar de consulta;
- 0 achados críticos;
- 0 achados médios;
- 0 drifts no store local observável;
- 0 self-healings no store local observável;
- falhas HubSpot e Calendar ainda não mensuráveis;
- tempo médio de recuperação ainda não mensurável.

Os zeros não comprovam ausência de incidentes, pois a amostra é pequena e o store local observado estava ausente.

## 5. Riscos conhecidos

Permanecem conhecidos:

- divergência entre sessão viva e arquivo recuperado;
- persistência normal sobrescrever recovery;
- concorrência entre processos;
- locks apenas locais;
- indisponibilidade externa produzir falso drift;
- Calendar e replay divergirem legitimamente;
- sucesso Calendar seguido de falha no histórico;
- ausência de correlação entre drift e reparo;
- falta de logs operacionais persistentes;
- cobertura parcial das projeções;
- ausência de recovery seguro para Calendar e HubSpot.

Esses riscos serão observados, não automatizados, durante a janela seguinte.

## 6. Plano de observação de 90 dias

Durante 90 dias serão acompanhados semanalmente:

- cobertura da auditoria;
- Deals e consultas observados;
- drifts por tipo;
- self-healings;
- recorrência de drift;
- falhas HubSpot;
- falhas Calendar;
- múltiplos eventos ativos;
- snapshots e sessões divergentes;
- consultas expiradas sem resultado;
- intervenções manuais;
- clientes afetados;
- tempo e custo de recuperação.

Revisões formais ocorrerão nos dias 30, 60 e 90.

Durante esse período:

- não será ativado watchdog;
- não será habilitado auto repair geral;
- não serão criadas novas capabilities sem gatilho objetivo.

## 7. Critérios para reabertura da Fase 9

Reabertura imediata:

- corrupção de Event Store ou hash chain;
- estado incorreto apresentado ao cliente;
- `MULTI_PROJECTION_DRIFT` em caso ativo;
- perda de histórico;
- self-healing incorreto;
- três incidentes críticos em 30 dias.

Reabertura por tendência:

- drift superior a 2% dos Deals auditados;
- mais de 20% dos drifts recorrentes;
- mais de cinco correções manuais mensais;
- resolução mediana superior a quatro horas;
- falha funcional superior a 1% das consultas;
- metadata completa inferior a 99%.

## 8. Critérios para abertura da Fase 10

Abertura imediata:

- informação jurídica enviada à pessoa errada;
- Deal associado ao Contact errado;
- documento ou Note vinculado à identidade errada;
- consulta atribuída ao representante em vez do assistido;
- incidente de confidencialidade ou LGPD.

Abertura por tendência:

- mais de 5% dos casos para terceiros;
- mais de 2% dos Contacts exigindo revisão;
- três colisões nome × telefone em 30 dias;
- reutilização incorreta de Deal por telefone;
- necessidade recorrente de distinguir representante e assistido;
- alias `personId/contactId` impedindo identificar o participante real.

## 9. Decisão arquitetural final

Fica formalmente registrado:

> **Consultation v9 encerrado.**

> **Domínio em observação operacional.**

O encerramento significa que o escopo estrutural foi entregue e validado pelos mecanismos disponíveis. Não significa que todos os riscos operacionais foram eliminados nem autoriza automação adicional.

Qualquer reabertura deverá:

1. apontar um critério objetivo deste documento;
2. apresentar evidência operacional;
3. limitar o escopo à capability necessária;
4. preservar Calendar como fonte operacional;
5. manter Event Store append-only;
6. passar por testes, auditoria arquitetural e release check.
