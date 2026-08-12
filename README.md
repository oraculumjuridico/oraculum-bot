# Oráculum Bot

Atendimento jurídico pelo WhatsApp integrado ao HubSpot, Google Drive, Google Calendar, Neon/PostgreSQL, transcrição e síntese de voz.

## Por onde começar

1. [Guia completo do sistema](docs/ORACULUM_SYSTEM_GUIDE.md)
2. [Arquitetura do runtime](docs/ORACULUM_RUNTIME_ARCHITECTURE.md)
3. [Runbook de produção](docs/operations/PRODUCTION_RUNBOOK.md)
4. [Catálogo de funções](docs/reference/FUNCTION_CATALOG.md)
5. [Variáveis de ambiente](.env.example)

## Desenvolvimento local

Requer Node.js 20 e npm 10.

```bash
npm ci
npm test
```

O comando `npm test` inclui os gates anteriores e posteriores da suíte. Testes que escrevem em PostgreSQL real, HubSpot, Drive, Calendar ou Meta são gates controlados e não fazem parte do teste local comum.

## Execução

```bash
npm start
```

Produção deve usar as configurações descritas em `.env.example`, persistência externa obrigatória e uma única instância enquanto houver estado temporário mantido no processo.

## Regra central

Um atendimento nunca deve criar uma segunda identidade para o mesmo caso. Contact, Deal, número do caso, pasta do Drive, documentos e histórico devem continuar vinculados durante entrada, retomada, correção e pós-atendimento.
