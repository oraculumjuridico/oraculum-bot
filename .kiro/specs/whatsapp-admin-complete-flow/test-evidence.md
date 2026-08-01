# Evidências de teste

Todos os dados usados são sintéticos. Nenhuma chamada a HubSpot, Drive, Meta ou WhatsApp é necessária para a validação.

## Cobertura adicionada

- CPF válido formatado e sem pontuação convergem para a identidade canônica.
- CPF inválido fica visível, não é tratado como ausência e bloqueia efeitos.
- Texto e payload de botão convergem para confirmação canônica.
- Idade não produz data de nascimento estimada.
- Questionário informa progresso e não repete campos respondidos.
- MIME/extensão incompatíveis são rejeitados; nomes são sanitizados.
- Upload só é confirmado após ID válido.
- CPF é consultado antes do telefone no runtime canônico e no fallback.
- Novo caso cria novo Negócio para o mesmo Contato e associa os IDs corretos.
- Contato incompatível por telefone é bloqueado.
- Consulta mascara CPF/telefone e não inclui cliente não correspondente.
- Complementação altera somente um campo e registra histórico sem criar objetos.
- Upload posterior usa o `caseFolderId` selecionado e falha sem falso sucesso.
- Agendamento indisponível registra pendência humana; sucesso exige `eventId`.
- Ausência individual de número do caso, Contato, Negócio ou pasta invalida o sucesso.
- Evento final contém somente dados técnicos permitidos.

## Comandos de validação

```powershell
node --check server.js
node --check src/domain/admin-assisted-ai-flow.js
node --check src/domain/admin-assisted-ai-schema.js
node --test test/admin-assisted-complete-flow.test.js test/admin-assisted-media-security.test.js
npm test
git diff --check
```

O resultado final destes comandos deve ser registrado na entrega local; este documento não presume aprovação antes da execução.

## Execução integral confirmada

- Início: `2026-08-01T04:14:54.8556990-03:00`
- Fim: `2026-08-01T04:19:30.7853452-03:00`
- Duração: `275930 ms`
- Comando: `npm test`
- Código de saída: `0`
- Soma dos contadores TAP: `384 pass`, `0 fail`
- Marcadores adicionais de suites customizadas: `90`
- Teste travado: nenhum
- `reengagement-routes.test.js` isolado: `8687 ms`, código `0`
- `realExternalActions=0`
- `posttest`: `RESULT 1/1 legacy third-party template passed`

Duas execuções anteriores da mesma rodada falharam em testes arquiteturais estáticos e geraram correções locais: extração do acesso a mídia para fora do roteador e renomeação do helper para não colidir com o pipeline documental legado. A terceira execução completa é a evidência válida do gate.
