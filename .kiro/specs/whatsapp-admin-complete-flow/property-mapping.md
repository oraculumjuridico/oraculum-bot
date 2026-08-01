# Mapeamento de propriedades

## Contato HubSpot

| Origem | Destino | Regra |
|---|---|---|
| nome completo | `firstname` / `lastname` | separar pelo contrato existente |
| CPF | `cpf_do_cliente` | 11 dígitos; omitir se ausente/inválido |
| telefone do cliente | `phone` / `mobilephone` | normalização HubSpot; preservar 9º dígito |
| e-mail | `email` | validar; nunca usar placeholder |
| data de nascimento | `date_of_birth` | somente data explicitamente informada |
| endereço/cidade/UF/CEP | `address` / `city` / `state` / `zip` | somente valores informados |
| área/benefício/origem | propriedades já permitidas pelo contrato | enums validados |

Idade não é gravada em `date_of_birth`; permanece no resumo estruturado do caso quando não existe propriedade específica confirmada.

Número, complemento e bairro compõem `address`, pois não existem propriedades separadas confirmadas no contrato local. Estado civil, profissão, situação profissional, idade, apelido e observações permanentes são preservados na descrição/snapshot até que propriedades oficiais sejam provisionadas; o runtime não cria propriedades.

## Negócio HubSpot

Campos jurídicos e operacionais entram nas propriedades já permitidas (`description`, área, tipo, prioridade, origem, número do caso e propriedades `oraculum_*`). Dados sem propriedade confirmada são consolidados na descrição estruturada, sem duplicar CPF ou outro identificador sensível.

Natureza, objetivo, datas do atendimento/requerimento/indeferimento, acidente, limitações, vínculo, composição familiar, renda, perícia, órgão e conflito seguem essa regra de fallback sem descarte silencioso.

## Drive

Pasta do caso confirmada → arquivo com nome sanitizado + MIME permitido + hash + categoria + papel da parte. Nome original, ID da mídia e horário são metadados de auditoria. Não há confirmação sem `fileId`.
