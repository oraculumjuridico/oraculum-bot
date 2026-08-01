# Preparação final para produção controlada

## Arquitetura e correções

O WhatsApp Admin mantém o fluxo `coleta → revisão → validação → plano canônico → reconciliação → HubSpot → Drive → verificação final`. Contato representa a pessoa; Negócio representa a demanda. O contrato final exige número do caso, Contato, Negócio, pasta e associação confirmada.

O caminho canônico agora propaga a pasta criada no Drive para `pasta_drive` do Contato somente quando o Contato foi criado nesta execução ou quando essa propriedade estava vazia. Uma pasta confiável já existente não é substituída.

## Mapeamento HubSpot

- Contato: nome, sobrenome, telefone/celular, e-mail, CPF canônico, nascimento exato, endereço, cidade, estado, CEP, origem, responsável e pasta Drive, quando válidos e previstos no contrato local.
- Negócio: protocolo, nome, área, tipo, situação, objetivo, resumo, descrição estruturada, prioridade, urgência, cidade, responsável, origem, estado documental, pendências, propriedades `oraculum_*` e snapshot.
- Profissão, situação profissional, estado civil, idade, apelido e outros dados sem propriedade confirmada permanecem na descrição/snapshot, sem inventar propriedades.
- CPF não é incluído na descrição do Negócio e ausência não apaga valores existentes.

## Documentos e Drive

PDF, JPEG e PNG passam por validação de MIME, extensão, tamanho, nome, SHA-256, titularidade e deduplicação. O upload usa somente o `caseFolderId` selecionado e o sucesso exige `fileId`.

A classificação original é preservada e recebe também uma categoria controlada de armazenamento: `Identificação`, `Médicos`, `Administrativos ou INSS`, `Contratos e procurações` ou `Outros`. Nesta fase a organização é por metadado; subpastas vazias não são criadas e nenhuma pasta existente é reorganizada.

## Testes e riscos

Os testes cobrem a propagação segura da pasta ao Contato, associação obrigatória, categorias controladas, CPF, reconciliação, documentos, idempotência e falhas parciais. Integrações reais não são exercitadas na suíte.

Riscos residuais: validação final do deploy depende de acesso autenticado ao Render; categorias documentais desconhecidas caem em `Outros`; ativação pós-humana continua deliberadamente fechada.

## Fase posterior

- migração de arquivos do computador;
- limpeza e reorganização de pastas históricas;
- OCR completo;
- enriquecimento automático do HubSpot a partir de documentos;
- criação física e gradual de subpastas por categoria, após validação operacional;
- ativação de `POST_HUMAN_COMPLEMENTATION_ENABLED`;
- ativação de `AUTO_REENGAJAMENTO`.
