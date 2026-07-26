# Mapeamento canônico de casos para o HubSpot

O modelo de `src/domain/canonical-case.js` é a fonte comum entre análise
documental, planejamento, deduplicação e escrita no CRM. Campos sem evidência
permanecem ausentes; valores vazios nunca substituem dados válidos.

| Dado canônico | Contato | Negócio | Regra |
| --- | --- | --- | --- |
| titular.nome | `firstname` | — | manifesto/revisão de identidade |
| titular.cpf | `cpf_do_cliente` | — | somente CPF validado e não conflitante |
| titular.telefone | `phone` | — | telefone normalizado e validado |
| titular.email | `email` | — | e-mail validado |
| titular.cidade/estado | `city`/`state` | — | somente evidência documental |
| área | — | `area_juridica` | classificação jurídica consolidada |
| tipo | — | `tipo_de_caso` | opção interna válida do HubSpot |
| temperatura | — | `temperatura_lead` | valor estruturado; emoji é derivado |
| número interno | — | `numero_de_caso` | reserva idempotente no PostgreSQL |
| título | — | `dealname` | função canônica; número com sigla não recebe outra sigla |
| origem documental | — | `pasta_drive` | referência lógica, sem caminho local |
| síntese documental | — | `resumo_cliente` | contagens e pendências, sem OCR bruto |

A atualização usa `caseImportId`, número interno e chaves normalizadas do
contato. O título é apenas uma chave auxiliar. Antes de criar, o pipeline
procura contato, negócio e associação; depois da escrita, relê os três objetos.
