# Auditoria de hardening de segurança do Google Drive

Data: 02/07/2026
Escopo: Google Drive, documentos, áudios e consumidores dos links
Natureza: auditoria técnica somente leitura

## Resumo executivo

O problema está concentrado em uma única função:
`tornarArquivoPublicoDrive()`, definida em
`src/domain/drive-files.js`.

Essa função cria uma permissão:

```js
{
  role: "reader",
  type: "anyone"
}
```

Ela é chamada depois de todo upload documental realizado por `uploadDrive()`
e depois de todo upload de áudio realizado por `uploadPastaAudio()`.

Os fluxos do bot não precisam de acesso público para continuar funcionando.
Eles usam:

- `fileId` para renomear ou marcar o arquivo como substituído;
- `webViewLink` para referências internas e notas no HubSpot;
- `pastaDriveId` para novos uploads;
- `pastaDriveLink` para acesso operacional da equipe.

Um `webViewLink` continua válido para usuários autenticados e autorizados mesmo
quando a permissão pública é removida.

### Verificação real somente leitura

Foi percorrida a árvore abaixo de `DRIVE_PASTA_CLIENTES_ID`, sem ler conteúdo,
nomes ou IDs.

Resultado:

| Item | Quantidade |
|---|---:|
| Descendentes encontrados | 18 |
| Pastas | 11 |
| Arquivos | 7 |
| Arquivos com `anyone/reader` | 7 |
| Pastas públicas | 0 |
| Permissões públicas de escrita | 0 |
| Pasta raiz com permissão `anyone` | 0 |

Portanto, **todos os sete arquivos encontrados estão potencialmente expostos
por link**. A auditoria não prova que terceiros tenham acessado esses arquivos;
prova apenas que o Drive aceitaria acesso anônimo para quem possuísse os links.

## 1. Pontos que criam permissões

### 1.1 Função central

Arquivo: `src/domain/drive-files.js`
Linhas aproximadas: 106–117
Função: `tornarArquivoPublicoDrive(fileId)`

Comportamento:

1. cria um cliente Google Drive;
2. chama `drive.permissions.create`;
3. concede `reader` para `anyone`;
4. fabrica uma URL direta
   `https://drive.google.com/uc?export=download&id=<fileId>`.

É o único ponto encontrado que cria permissões.

Não foram encontrados:

- `permissions.update`;
- `permissions.delete`;
- permissão por e-mail;
- permissão por grupo;
- expiração de permissão;
- política de domínio;
- revogação automática.

### 1.2 Chamada em documentos

Arquivo: `src/domain/drive-files.js`
Função: `uploadDrive()`
Linha aproximada: 93

Depois de `drive.files.create`, o código executa:

```js
await tornarArquivoPublicoDrive(res.data.id)
```

Impacto: todo documento enviado pelo fluxo guiado ou como arquivo avulso recebe
acesso público por link.

### 1.3 Chamada em áudios

Arquivo: `src/domain/drive-files.js`
Função: `uploadPastaAudio()`
Linha aproximada: 174

Depois de criar o áudio, o código executa:

```js
const directDownloadUrl = await tornarArquivoPublicoDrive(res.data.id)
```

Impacto: todo áudio salvo por esse helper recebe acesso público por link.

## 2. Pontos que geram links

### 2.1 `webViewLink` fornecido pelo Google

As operações abaixo solicitam `webViewLink` ao Google Drive:

| Função | Objeto | Uso |
|---|---|---|
| `obterOuCriarPastaArea` | Pasta de área | Retorno interno |
| `criarPastaCliente` | Pasta do caso | Armazenado em `u.pastaDriveLink` |
| `uploadDrive` | Documento | Estado pendente e notas HubSpot |
| `marcarArquivoDriveSubstituido` | Documento | Nota HubSpot |
| `renomearArquivoDrive` | Documento | Nota HubSpot |
| `uploadPastaAudio` | Áudio | Nota HubSpot e estado temporário |

`webViewLink` não torna um arquivo público sozinho. A capacidade de acesso vem
da ACL do Drive. Depois da migração privada, o mesmo link abrirá somente para
contas autorizadas.

### 2.2 URL direta fabricada pelo código

`tornarArquivoPublicoDrive()` gera:

```text
https://drive.google.com/uc?export=download&id=<fileId>
```

Essa URL é retornada como `directDownloadUrl` por `uploadPastaAudio()`.

Não foi encontrado consumidor de `directDownloadUrl` no codebase. O campo é
produzido, mas não é utilizado por `server.js`, handlers, telas ou testes.

### 2.3 Links de pasta

`u.pastaDriveLink` é persistido e sincronizado com o HubSpot:

- propriedade `pasta_drive`;
- resumo/briefing do caso;
- notas de cadastro;
- interface administrativa.

As pastas não são tornadas públicas pelo código. A verificação real confirmou
que a pasta raiz e as pastas descendentes não possuem permissão `anyone`.

## 3. Uploads de documentos

### 3.1 Documento avulso na área do cliente

Arquivo: `server.js`
Linha aproximada: 8345

Fluxo:

1. recebe foto/PDF;
2. baixa mídia do WhatsApp;
3. chama `uploadDrive`;
4. guarda:
   - `_docClientePendenteId`;
   - `_docClientePendenteArquivo` (`webViewLink`);
   - `_docClientePendenteNome`;
5. registra nota no HubSpot;
6. pede ao cliente para anexar/classificar.

Após confirmação, o arquivo é renomeado pelo `fileId`. O link é usado apenas na
nota interna.

### 3.2 Documento guiado

Arquivo: `server.js`
Linha aproximada: 8399

Fluxo:

1. identifica documento e folha esperados;
2. chama `uploadDrive`;
3. guarda `ultimoArqId` e `ultimoArqNome`;
4. atualiza status documental;
5. registra `webViewLink` em nota HubSpot.

### 3.3 Reenvio e substituição

Arquivo: `server.js`
Linhas aproximadas: 13980–14003

O arquivo anterior:

- não é apagado;
- é renomeado para `[SUBSTITUIDO - NAO USAR] ...`;
- continua com a ACL pública já existente;
- tem seu `webViewLink` registrado em nota.

A migração deve incluir também arquivos substituídos, pois renomear não remove
permissões.

## 4. Uploads de áudio

### 4.1 Áudio geral da área do cliente

Arquivo: `src/domain/audio/audio-intake-pipeline-router.js`
Linha aproximada: 47

Áudios que não são descrição inicial nem urgência são enviados por
`uploadPastaAudio()`. O `webViewLink` pode ser:

- armazenado em `_audioClientePendenteArquivo`;
- incluído em nota sobre o caso atual;
- incluído em nota de áudio geral.

### 4.2 Descrição confirmada

Arquivo: `server.js`
Linha aproximada: 5335

Depois da conclusão do cadastro, `_audioDescBuffer` é salvo em uma subpasta de
áudios transcritos confirmados.

### 4.3 Descrições corrigidas

Arquivo: `server.js`
Linha aproximada: 5345

Cada item de `audiosDescCorrigidos` é salvo por `uploadPastaAudio()`.

### 4.4 Áudio urgente

Helper: `salvarAudioTranscritoNoCaso()`
Chamadas em `server.js`: aproximadamente 13489, 13503 e 13520

Áudios urgentes confirmados ou corrigidos passam indiretamente por
`uploadPastaAudio()` e também se tornam públicos.

### 4.5 Subpastas de áudio

Cada chamada de `uploadPastaAudio()` cria uma nova subpasta. Essas subpastas não
recebem permissão pública explícita. Somente o arquivo de áudio recebe
`anyone/reader`.

## 5. Consumidores dos links

### 5.1 HubSpot

É o principal consumidor.

Links aparecem em:

- propriedade `pasta_drive`;
- notas de cadastro;
- notas de documento recebido;
- notas de documento anexado/classificado;
- notas de arquivo substituído;
- notas de áudio;
- mensagens sobre o caso atual.

Esses links podem permanecer com a mesma URL após a remoção da ACL pública.
Usuários do escritório precisarão estar autenticados numa conta autorizada.

### 5.2 Estado do usuário

São armazenados:

- `pastaDriveId`;
- `pastaDriveLink`;
- `_docClientePendenteId`;
- `_docClientePendenteArquivo`;
- `_audioClientePendenteArquivo`;
- `ultimoArqId`;
- `ultimoArqNome`.

O fluxo usa a presença de alguns links como marcador de que o upload existe.
Como arquivos privados continuam retornando `webViewLink`, essa lógica não
precisa mudar.

### 5.3 Área administrativa

Briefings e telas administrativas exibem o link da pasta do caso. A pasta já é
privada; o acesso depende da conta Google do operador.

### 5.4 Cliente no WhatsApp

Não foi encontrado envio direto de `webViewLink` ou `directDownloadUrl` ao
cliente nas telas do WhatsApp.

O cliente recebe confirmação de que o documento foi anexado, mas não recebe o
link do Drive.

### 5.5 Código do bot

O bot não baixa novamente o documento usando o link público. Operações
posteriores usam `fileId` com OAuth:

- renomear;
- marcar como substituído;
- organizar uploads.

Logo, o bot não depende de `anyone/reader`.

## 6. Riscos LGPD e de sigilo

### 6.1 Categorias de dados potencialmente afetadas

Os fluxos admitem:

- documentos de identidade;
- CPF;
- comprovantes;
- dados previdenciários;
- dados trabalhistas;
- informações financeiras;
- documentos familiares;
- dados de saúde;
- provas jurídicas;
- áudios com relato do caso;
- mensagens urgentes;
- potencialmente dados de crianças, terceiros, vítimas ou acusados.

Parte desse material pode se enquadrar como dado pessoal sensível ou estar
protegida por dever profissional de confidencialidade.

### 6.2 Ameaças

- link copiado de nota, log, navegador ou mensagem interna;
- compartilhamento indevido dentro ou fora do escritório;
- indexação acidental por ferramenta de terceiros;
- exposição por extensão de navegador ou histórico;
- acesso posterior por ex-colaborador que conservou o link;
- aumento do impacto de comprometimento do HubSpot;
- dificuldade de demonstrar controle de acesso.

### 6.3 Contradição de UX

O bot informa que os dados são tratados com sigilo e usados exclusivamente
para fins jurídicos. A ACL `anyone/reader` não exige autenticação nem vínculo
com o escritório, portanto não implementa tecnicamente essa promessa.

### 6.4 Limite da conclusão

A auditoria confirmou permissões públicas, mas não acessos indevidos. Para
investigar eventual incidente são necessários:

- logs de auditoria do Google Workspace, se disponíveis;
- histórico de permissões;
- revisão de compartilhamentos e contas;
- avaliação jurídica/encarregado de dados;
- eventual procedimento de resposta a incidente.

## 7. Estratégia de migração sem quebrar fluxos

### Fase 0 — Congelamento

- suspender novos deploys não relacionados;
- não compartilhar novos links;
- registrar contagem e escopo sem copiar nomes/IDs para logs;
- definir responsável pela revogação.

### Fase 1 — Modelo de acesso privado

Antes de revogar:

1. confirmar qual conta OAuth é proprietária ou gestora da pasta raiz;
2. criar um Google Group ou lista explícita de contas autorizadas;
3. compartilhar a pasta raiz com esse grupo, preferencialmente como leitor ou
   colaborador conforme a necessidade;
4. validar acesso de advogado, administrativo e bot;
5. validar que uma janela anônima não acessa a pasta.

Evitar conceder acesso individual arquivo por arquivo. Acesso herdado da pasta
raiz é mais auditável e simples de revogar.

### Fase 2 — Impedir novas exposições

Alterar `src/domain/drive-files.js`:

- remover a chamada a `tornarArquivoPublicoDrive()` de `uploadDrive()`;
- remover a chamada de `uploadPastaAudio()`;
- deixar de produzir URL direta pública;
- manter `id`, `name`, `webViewLink` e `folderId`;
- remover ou tornar inacessível a função/export que cria `anyone`.

Adicionar teste que falhe se houver:

- `permissions.create` com `type: "anyone"`;
- fabricação de URL pública de download;
- reintrodução de chamada ao helper público nos uploads.

### Fase 3 — Revogar arquivos existentes

Executar ferramenta controlada e idempotente:

1. percorrer somente descendentes de `DRIVE_PASTA_CLIENTES_ID`;
2. listar permissões;
3. selecionar apenas `type === "anyone"`;
4. gerar dry-run com contagens, nunca nomes ou conteúdo em log comum;
5. excluir as permissões selecionadas por `permissionId`;
6. não alterar permissões de contas, grupos ou domínio;
7. repetir a varredura e exigir contagem pública igual a zero.

Essa operação altera estado externo e deve ocorrer somente depois de backup,
aprovação e validação de acesso da equipe.

### Fase 4 — Validar consumidores

Testar:

- upload documental guiado;
- upload avulso e classificação;
- renomeação;
- reenvio/substituição;
- áudio geral;
- áudio de descrição;
- áudio urgente;
- abertura do link por equipe autorizada;
- negação em navegador anônimo;
- abertura dos links já presentes no HubSpot.

As URLs não precisam ser substituídas. A ACL muda, não o `fileId`.

### Fase 5 — Monitoramento

- varredura periódica que alerte se surgir nova permissão `anyone`;
- auditoria das contas/grupos autorizados;
- revisão de arquivos órfãos;
- política de retenção e descarte;
- procedimento de desligamento de colaboradores.

## Respostas

### A) Quais permissões precisam ser removidas?

Todas as permissões com:

```text
type = anyone
```

nos arquivos abaixo da pasta de clientes.

No inventário atual são sete permissões públicas de leitura, uma em cada
arquivo encontrado. Não há permissão pública de escrita nem pasta pública.

Também precisam ser removidos do código:

- a criação automática de `anyone/reader`;
- a geração de `directDownloadUrl` pública;
- o export de `tornarArquivoPublicoDrive`, se não houver uso administrativo
  explicitamente autorizado.

Permissões de contas específicas, grupos autorizados e a conta OAuth do bot
não devem ser removidas.

### B) Quais fluxos dependem dos links públicos?

Nenhum fluxo identificado depende de acesso **público**.

Fluxos dependem de `webViewLink`, mas podem operar com link privado:

- notas e propriedades do HubSpot;
- briefing administrativo;
- confirmação/classificação de documento;
- registro de áudio no caso.

Operações do bot dependem de `fileId` e OAuth, não do link público.

`directDownloadUrl` não possui consumidor encontrado.

### C) Como migrar para acesso privado?

1. compartilhar a pasta raiz somente com grupo/contas do escritório;
2. validar o acesso dessas contas;
3. impedir novos `anyone/reader` no código;
4. revogar permissões públicas existentes por `permissionId`;
5. manter os mesmos `webViewLink`;
6. testar acesso autorizado e negação anônima;
7. criar detector contínuo de ACL pública.

Não é necessário mudar IDs, nomes, notas HubSpot ou UX do cliente.

### D) Há documentos já potencialmente expostos?

Sim.

A verificação real encontrou sete arquivos e os sete possuem
`anyone/reader`. Eles podem incluir documentos ou áudios, mas esta auditoria
deliberadamente não leu nomes nem conteúdo.

“Potencialmente exposto” significa acessível anonimamente por link. Não há
evidência nesta auditoria de que uma pessoa não autorizada tenha efetivamente
acessado os arquivos.

### E) Qual a menor PR segura para correção?

A menor PR segura para **interromper novas exposições** deve:

1. remover as duas chamadas a `tornarArquivoPublicoDrive`;
2. eliminar a URL pública direta;
3. manter o retorno de `webViewLink`;
4. adicionar teste de regressão que proíba `type: "anyone"`;
5. não alterar `server.js`, UX, HubSpot ou fluxos documentais.

Escopo esperado: `src/domain/drive-files.js` e um teste específico.

Essa PR interrompe o crescimento do problema, mas não encerra o bloqueador
sozinha. Antes do Go-Live ainda é obrigatório executar a migração controlada
dos sete arquivos existentes e confirmar:

- zero ACL pública;
- acesso normal da equipe;
- acesso anônimo negado;
- uploads novos privados.

## Recomendação final

Executar duas entregas separadas:

1. **PR de contenção:** novos documentos e áudios privados, com teste de
   regressão;
2. **operação de remediação:** dry-run, revogação das ACLs existentes,
   verificação e registro de resultado.

Essa divisão minimiza risco: a mudança de código é pequena e reversível,
enquanto a alteração de permissões históricas ocorre de forma explícita,
auditável e somente depois de comprovar o acesso da equipe.
