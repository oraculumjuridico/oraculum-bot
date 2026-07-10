# Consultation — linha de base operacional

## Objetivo

Esta baseline registra o estado observável do domínio Consultation antes de novas expansões da Fase 9.

Janela inicial:

- início: 30/05/2026;
- fim: 28/06/2026;
- modo: coleta e observação read-only.

Nenhum watchdog, enforcement adicional ou capability de repair foi introduzido.

## Baseline inicial

| Indicador | Valor comprovável | Fonte |
|---|---:|---|
| Consultas/Deals auditados | 1 | auditoria operacional read-only executada em 28/06/2026 |
| Drifts detectados | 0 no store local observável | `consultation-integrity-events.jsonl` ausente |
| Self-healings executados | 0 no store local observável | `consultation-integrity-events.jsonl` ausente |
| Falhas de sincronização HubSpot | Não mensurável | não há logs persistentes configurados |
| Falhas de Calendar | Não mensurável | não há logs persistentes configurados |
| Tempo médio de recuperação | Não mensurável | não há pares persistidos drift → self-healed |
| Eventos de integridade registrados | 0 no store local observável | store local ausente |

### Resultado da auditoria inicial

- Deals auditados: 1;
- eventos Calendar de consulta encontrados: 0;
- sessões locais observadas: 1;
- snapshots ativos: 0;
- Deals no stage legado Consulta: 0;
- achados críticos: 0;
- achados médios: 0;
- achados aceitáveis: 0.

Os zeros de integridade significam “nenhum evento disponível no store deste workspace”, não prova de ausência de drift ou self-healing em outro ambiente.

## Mecanismo de observação

Foi criado o comando:

```text
npm run consultation:baseline
```

O coletor:

1. executa a auditoria operacional read-only;
2. lê o Event Store de integridade sem modificá-lo;
3. conta drifts e self-healings dentro da janela de 30 dias;
4. calcula duração entre drift e self-healing quando existe par temporal para o mesmo `consultationId`;
5. lê arquivos de log explicitamente configurados;
6. imprime JSON em stdout;
7. não persiste resultado nem corrige estado.

Arquivos de log podem ser informados por:

```text
CONSULTATION_LOG_FILES=logs/runtime.log,logs/worker.log
```

Sem logs legíveis, falhas HubSpot e Calendar retornam `null`, com a limitação `persistent_logs_not_available`. Elas não são reportadas como zero.

## Definições dos indicadores

### Consultas auditadas

Quantidade de Deals incluídos na auditoria read-only. Essa métrica mede cobertura da auditoria, não quantidade de eventos Calendar.

### Drifts detectados

Quantidade de eventos:

```text
consultation.integrity_drift_detected
```

na janela.

### Self-healings executados

Quantidade de eventos:

```text
consultation.self_healed
```

na janela.

### Falhas HubSpot e Calendar

Quantidade de linhas de erro com timestamp ISO, dentro da janela, nos logs configurados e contendo respectivamente `HubSpot` ou `Calendar`.

Essa é uma contagem de registros de falha, não de incidentes deduplicados. Sem logs persistentes, a métrica é indisponível.

### Tempo médio de recuperação

Média entre `detectedAt` de um drift e `repairedAt` do self-healing subsequente do mesmo `consultationId`.

Como ainda não há correlation ID, o pareamento é cronológico. O valor deve ser tratado como indicador operacional, não prova jurídica da duração de um reparo específico.

### Eventos de integridade

Total de eventos de integridade válidos encontrados na janela, incluindo drift e self-healing.

## Lacunas atuais

1. `logErro()` mantém apenas os últimos 100 erros em memória e escreve no console; não há sink persistente próprio.
2. O ambiente observado não possui Event Store de integridade local.
3. Não existe correlation ID entre drift e self-healing.
4. Não existe histórico persistido das execuções da auditoria.
5. A baseline é pontual; tendências exigem execução periódica por infraestrutura externa.
6. A contagem HubSpot/Calendar depende de logs com timestamp ISO.
7. Um Deal auditado é amostra insuficiente para concluir estabilidade operacional ampla.

## Critério para decidir a continuidade da Fase 9

A Fase 9 não deve ser expandida com watchdog enquanto:

- falhas HubSpot e Calendar permanecerem não mensuráveis;
- não houver janela representativa de eventos de integridade;
- a cobertura auditada continuar pequena;
- não houver evidência do tempo e taxa de sucesso de recuperação;
- não for possível distinguir “zero incidentes” de “telemetria ausente”.

Pode-se considerar a Fase 9 funcionalmente concluída, sem novas capabilities, quando uma janela operacional acordada demonstrar:

- auditoria executada de forma recorrente e com cobertura conhecida;
- drifts classificados e quantificados;
- self-healings auditáveis;
- falhas externas mensuradas;
- tempo de recuperação conhecido;
- ausência de incidentes críticos sem tratamento.

Com a baseline atual, a decisão recomendada é:

> manter a Fase 9 em validação operacional, sem expansão automática e sem declarar conclusão por ausência de dados.
