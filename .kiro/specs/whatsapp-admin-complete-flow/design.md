# Design — WhatsApp Admin completo

## Arquitetura

O fluxo mantém o orquestrador em `admin-assisted-ai-flow`, a estrutura e validação em `admin-assisted-ai-schema`, a extração em `admin-assisted-ai-intelligence` e a custódia temporária em `admin-assisted-media`. O questionário declarativo separa campos gerais dos campos por área e calcula progresso sem repetir respostas.

```text
WhatsApp Admin autenticado
  ├─ texto/áudio → extração tipada → questionário → revisão única
  │                                      └─ confirmação → executor canônico
  ├─ menu → casos/pendências/complementação
  ├─ menu → documentos → staging/hash/revisão → Drive
  └─ menu → agenda/pós-humano

executor canônico → identidade do contato → HubSpot contato/negócio → Drive
```

## Identidade

O campo CPF carrega `valor`, `status` e `verificacao`. A validação reaproveita o contrato HubSpot; assim escrita, busca e reconciliação usam a mesma identidade de 11 dígitos. O telefone do administrador não participa da identidade do cliente.

## Confirmação e atomicidade observável

Entradas textuais, numéricas e IDs de botão são normalizadas para as mesmas ações. Antes do executor, todos os obrigatórios e todos os campos inválidos são bloqueios. Depois dele, o contrato existente exige IDs do contato, negócio e pasta. Em erro, a sessão e o snapshot permanecem disponíveis para revisão e o rollback compensatório é acionado quando configurado.

## Documentos

A mídia é baixada uma vez, limitada, validada por MIME/extensão e armazenada temporariamente por SHA-256. O nome original fica apenas em metadados de auditoria e um nome seguro é usado no upload. Divergência de titularidade mantém o item em quarentena. A confirmação ocorre apenas com ID externo verificável e hash compatível quando fornecido.

## Compatibilidade

Os contratos das PRs 10–12 são preservados: invariantes antes das integrações, adaptador single-case, canonicalização de CPF, telefone HubSpot separado e logs sanitizados.

## Operações sobre casos existentes

Consulta, complementação, documento posterior e agenda usam primeiro um caso selecionado. A consulta retorna projeção mascarada; a complementação produz patches separados de Contato/Negócio e histórico técnico; documento exige a pasta do caso selecionado; agendamento só confirma depois de `eventId`. CPF precede telefone na reconciliação e novo caso nunca reutiliza automaticamente o Negócio anterior.
