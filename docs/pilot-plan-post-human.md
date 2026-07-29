# Plano de Piloto Controlado — Fluxo Pós-Atendimento Humano

**Feature ID:** `post-human-complementation`
**Versão:** 1.0
**Data:** 2026-07-28
**Responsável:** Escritório Oráculum

---

## 1. Objetivo do piloto

Validar em ambiente real controlado a operação segura do fluxo de complementação pós-atendimento, confirmando que:

- a identificação do Negócio correto funciona sem ambiguidade;
- a análise documental não solicita itens já recebidos;
- a janela de 24 horas é respeitada;
- o HubSpot não sofre sobrescrita de dados confirmados;
- a idempotência impede duplicação de mensagens;
- a recuperação após reinício funciona corretamente;
- falhas externas não corrompem o estado do ciclo;
- dados sensíveis são mascarados em logs.

O piloto permitirá observar o comportamento real da feature com um caso autorizado antes da expansão gradual para outros casos.

---

## 2. Caso piloto autorizado

**Caso piloto:** Cliente "Damiana"
**Identificação técnica:** `numero_caso` conhecido e autorizado
**Observação:** Nome não fictício utilizado com autorização para fins operacionais do piloto

**IMPORTANTE:** Damiana é apenas o **primeiro caso piloto**. A funcionalidade é **geral e reutilizável** para qualquer caso do escritório. Após validação bem-sucedida do primeiro piloto, a expansão gradual permitirá inclusão de outros casos mediante autorização expressa.

A feature **NÃO** é específica para Damiana ou para qualquer tipo particular de caso. O design, implementação e testes foram construídos para suportar todos os tipos de casos jurídicos do escritório (Previdenciário, Cível, Família, Trabalhista, etc.) respeitando as particularidades documentais e de informações de cada área.

---

## 3. Pré-condições

### 3.1. Feature flag

**Variável:** `POST_HUMAN_COMPLEMENTATION_ENABLED`
**Estado padrão:** `false` (desligada)
**Ambiente:** `.env` e configuração do Render

A feature permanecerá desligada até autorização expressa para o piloto.

### 3.2. Allowlist restrita

**Variável:** `POST_HUMAN_PILOT_CASES`
**Formato:** Lista de números de caso separados por vírgula
**Exemplo:** `PREV.260701.001` (caso real autorizado)
**Regra:** Somente casos explicitamente listados serão processados

Valores inválidos (ausência, string vazia, wildcard `*`, casos não autorizados) resultam em **zero casos autorizados**.

### 3.3. Vínculo Contato–Negócio confirmado

Antes do piloto, confirmar que:

- O Contato do caso piloto está cadastrado no HubSpot;
- O Negócio está associado ao Contato correto;
- O `numero_caso` está registrado corretamente;
- O telefone normalizado está vinculado ao Contato;
- Não há ambiguidade na identificação do caso.

### 3.4. Template aprovado disponível

**Template:** `caso_atualizacao_v3`
**Categoria:** Utilidade
**Idioma:** Português (BR)
**Componentes validados:**
- Cabeçalho de imagem (URL oficial)
- Corpo com um parâmetro de texto
- Rodapé (sem parâmetros)
- Sem botões

**URL oficial da imagem:** Configurada em `META_TEMPLATES.casoAtualizacao.headerImageUrl`

Antes do piloto real, o template deve estar aprovado no WABA (WhatsApp Business API) e testado com mocks.

---

## 4. Efeitos externos: permitidos e proibidos

### 4.1. Permitidos no piloto real (após autorização)

- **WhatsApp:** Envio de mensagem livre (janela aberta) ou template (janela fechada) para o caso piloto autorizado
- **HubSpot:** Atualização segura de Contato e Negócio sem sobrescrita (somente campos vazios ou iguais normalizados)
- **HubSpot:** Criação de notas de divergência quando valores diferirem
- **Google Drive:** Upload de documentos recebidos na pasta correta do caso
- **PostgreSQL/Neon:** Persistência de ciclos, estados e progresso

### 4.2. Proibidos durante piloto

- Envio para casos não autorizados
- Sobrescrita de dados confirmados no HubSpot
- Escrita em propriedades não comprovadas
- Reenvio automático após reinício quando resultado for incerto
- Envio quando feature flag estiver desligada
- Envio quando allowlist não incluir o caso

### 4.3. Bloqueios de segurança

- Feature flag desligada → nenhuma ação externa
- Caso não listado na allowlist → nenhuma ação externa
- Usuário não-admin → nenhuma ação externa
- Ciclo já ativo → resposta de idempotência, sem duplicação
- Persistência produtiva (Neon) indisponível → nenhum envio autorizado

---

## 5. Uso de mocks durante simulação

### 5.1. Simulação automatizada (T13.2)

Durante a execução de testes automatizados (T13.2), **todos** os efeitos externos usam mocks:

- **Meta/WhatsApp:** Mock de `sendFree` e `sendTemplate` sem envio real
- **HubSpot:** Mock de `hsAtualizarContato`, `hsAtualizarNegocio`, `hsCriarNotaNegocio` sem escrita real
- **Google Drive:** Mock de `uploadDrive` sem upload real
- **PostgreSQL/Neon:** Mock de repositório em memória ou arquivo temporário local

**Objetivo:** Validar lógica de decisão, máquina de estados, idempotência e tratamento de falhas sem efeitos externos reais.

### 5.2. Piloto real (após T13.2 e autorização humana)

No piloto real em produção:

- **Mocks desligados:** Integrações reais ativadas
- **Allowlist restrita:** Somente caso piloto autorizado
- **Monitoramento ativo:** Logs, estados e evidências coletadas em tempo real
- **Rollback preparado:** Flag pode ser desligada a qualquer momento

---

## 6. Critérios de sucesso

O piloto será considerado bem-sucedido se atender **todos** os critérios abaixo:

### 6.1. Identificação e isolamento

- ✅ O caso piloto é identificado corretamente
- ✅ Resposta do cliente é vinculada ao Negócio correto
- ✅ Não há mistura com outros casos ou Negócios do mesmo Contato

### 6.2. Análise documental

- ✅ O sistema não solicita documentos já recebidos
- ✅ Documentos não analisados não são tratados como faltantes
- ✅ Estado documental reflete a realidade (sem inferências incorretas)

### 6.3. Janela e tipo de envio

- ✅ Janela de 24 horas calculada corretamente no momento do envio
- ✅ Mensagem livre usada dentro da janela
- ✅ Template usado fora da janela
- ✅ Ligação telefônica não atualiza a janela

### 6.4. HubSpot seguro

- ✅ Campos vazios são preenchidos corretamente
- ✅ Valores confirmados não são sobrescritos
- ✅ Divergências geram nota de revisão, não sobrescrita
- ✅ `numero_de_caso` é preservado

### 6.5. Idempotência

- ✅ Múltiplas confirmações do mesmo ciclo não geram múltiplas mensagens
- ✅ Reinício do serviço não causa reenvio duplicado
- ✅ Ciclos em estados terminais não são reprocessados

### 6.6. Recuperação

- ✅ Ciclo pendente é retomado após reinício
- ✅ Ciclo com resultado incerto não é reenviado automaticamente
- ✅ Estado é consistente após recuperação

### 6.7. Auditabilidade

- ✅ 100% dos ciclos possuem registro auditável
- ✅ Timestamps precisos de cada transição
- ✅ Dados sensíveis mascarados em logs

---

## 7. Critérios de interrupção

O piloto será **interrompido imediatamente** se ocorrer qualquer dos seguintes eventos:

### 7.1. Critérios críticos (interrupção obrigatória)

- ❌ Sobrescrita de dados confirmados no HubSpot
- ❌ Envio de mensagem para caso não autorizado
- ❌ Mistura de dados entre casos diferentes
- ❌ Perda de contexto do ciclo após reinício
- ❌ Exposição de dados sensíveis (CPF, telefone) em logs públicos
- ❌ Duplicação de mensagens por falha de idempotência

### 7.2. Critérios não-críticos (avaliação caso a caso)

- ⚠️ Falha externa persistente (Meta, HubSpot, Drive) sem recuperação
- ⚠️ Divergências não registradas corretamente
- ⚠️ Estado documental incorreto causando solicitação inadequada
- ⚠️ Template não carregado ou configuração incompleta

**Ação:** Desligar feature flag, documentar incidente, corrigir código, revalidar em testes antes de retomar.

---

## 8. Rollback

### 8.1. Procedimento de rollback

1. **Desligar feature flag:**
   `POST_HUMAN_COMPLEMENTATION_ENABLED=false`

2. **Efeito imediato:**
   - Botão "✅ Atendimento realizado" não aparece ou fica indisponível
   - Nenhuma nova mensagem é enviada
   - Comportamento anterior do bot é restaurado

3. **Ciclos existentes:**
   - Ciclos persistidos **não são apagados**
   - Ciclos em andamento ficam visíveis para revisão manual
   - Podem ser retomados se flag for religada após correção

4. **Sem perda de dados:**
   - Nenhum dado do HubSpot é revertido (atualizações já feitas permanecem)
   - Documentos já enviados ao Drive permanecem
   - Histórico de ciclos permanece auditável

### 8.2. Quando fazer rollback

- Qualquer critério crítico de interrupção for atingido
- Múltiplas falhas técnicas consecutivas
- Solicitação do responsável do piloto
- Detecção de comportamento anômalo

### 8.3. Retomada após rollback

Antes de religar a flag:

1. Identificar e corrigir a causa raiz
2. Executar testes automatizados completos
3. Validar correção em ambiente de teste
4. Obter autorização para retomada
5. Religar flag somente para o caso piloto autorizado

---

## 9. Evidências a registrar

Durante todo o piloto, as seguintes evidências devem ser coletadas:

### 9.1. Evidências técnicas

- **Logs mascarados:** Todas as transições de estado com timestamps
- **Ciclos criados:** `cycleId`, `negocioId`, `numeroCaso`, `sequencia`, `status`, `tipoEnvio`
- **Mensagens enviadas:** Tipo (livre/template), timestamp, resultado
- **Falhas externas:** Tipo de integração, erro sanitizado, tentativas
- **Divergências HubSpot:** Campo, valor esperado vs encontrado, ação tomada
- **Idempotência:** Tentativas repetidas bloqueadas
- **Recuperação:** Ciclos retomados após reinício

### 9.2. Evidências operacionais

- **Resposta do cliente:** Tempo de resposta, tipo de resposta (documento/texto/parcial)
- **Documentos recebidos:** Quantidade, tipo, vinculação ao caso correto
- **Informações complementares:** Campos solicitados e preenchidos
- **Revisões humanas:** Casos encaminhados para revisão e motivo
- **Tempo de ciclo:** Da confirmação até conclusão ou cancelamento

### 9.3. Métricas de sucesso

| Métrica | Meta | Como medir |
|---------|------|------------|
| Taxa de conclusão de ciclo | ≥ 80% | Ciclos `completed` / ciclos `pending` |
| Tempo médio de resposta | ≤ 24 horas | Média de (`respondidoEm` - `enviadoEm`) |
| Divergências registradas | 100% auditável | Notas criadas / divergências detectadas |
| Falhas por integração | < 5% | Falhas / tentativas por serviço |
| Reenvios duplicados | 0 | Mensagens duplicadas detectadas |
| Sobrescritas indevidas | 0 | Valores sobrescritos sem autorização |
| Mistura entre casos | 0 | Documentos no caso errado |

### 9.4. Formato de registro

As evidências serão armazenadas em:

- **Logs do servidor:** Arquivo rotativo com mascaramento ativo
- **Tabela `post_human_cycles`:** PostgreSQL/Neon (produção) ou JSON local (dev/testes)
- **Documento de evidências:** `docs/post-human-pilot-simulation-evidence.md` (simulação) e `docs/post-human-pilot-real-evidence.md` (piloto real)

---

## 10. Escopo e generalidade da funcionalidade

### 10.1. Damiana como primeiro piloto

**Damiana é apenas o primeiro caso piloto autorizado.**

A escolha não indica que a feature foi construída especificamente para este caso. Damiana foi selecionada por critérios operacionais do escritório para validação inicial em ambiente controlado.

### 10.2. Funcionalidade geral

A feature `post-human-complementation` foi projetada, implementada e testada para ser **geral e reutilizável** para:

- **Todas as áreas jurídicas:** Previdenciário, Cível, Família, Trabalhista, Consumidor, etc.
- **Todos os tipos de caso:** Independentemente da classificação ou complexidade
- **Múltiplos Contatos e Negócios:** Isolamento garantido por design
- **Diferentes estados documentais:** 6 estados mapeados e testados
- **Diversos campos complementares:** Integração com Admin Assistido existente
- **Qualquer estágio do caso:** Desde triagem concluída até análise final

### 10.3. Expansão gradual

Após validação bem-sucedida do piloto com Damiana:

1. **Análise de evidências:** Revisão humana de todas as métricas e logs
2. **Decisão de expansão:** Autorização para incluir 2-3 casos adicionais
3. **Iteração controlada:** Repetir ciclo de validação com novos casos
4. **Escala progressiva:** Aumentar allowlist gradualmente conforme confiança
5. **Produção geral:** Remover allowlist quando feature estiver madura

A expansão **sempre** dependerá de validação humana das evidências coletadas. Não haverá ativação automática em massa.

---

## 11. Cronograma do piloto

### Fase 1: Preparação (antes do piloto real)

- ✅ Requisitos aprovados (requirements.md)
- ✅ Design aprovado (design.md)
- ✅ Tarefas T1 a T12 concluídas (implementação e testes)
- ✅ T13.1 concluída (este documento)
- ⏳ T13.2 a executar (simulação com mocks)
- ⏳ Template validado no WABA
- ⏳ Migration aplicada em janela autorizada
- ⏳ Conexão Neon configurada e testada

### Fase 2: Simulação automatizada (T13.2)

- Duração: 1-2 dias
- Executar `test/post-human-pilot-simulation.test.js`
- Validar com mocks todas as integrações
- Registrar evidências em `docs/post-human-pilot-simulation-evidence.md`
- Revisão humana dos resultados

### Fase 3: Autorização do piloto real

- Aprovação expressa do responsável
- Configuração de `POST_HUMAN_PILOT_CASES` com caso autorizado
- Ativação de `POST_HUMAN_COMPLEMENTATION_ENABLED=true`
- Confirmação de pré-condições

### Fase 4: Piloto real em produção

- Duração: 7 dias corridos após autorização
- Monitoramento ativo diário
- Coleta contínua de evidências
- Rollback disponível a qualquer momento
- Registro em `docs/post-human-pilot-real-evidence.md`

### Fase 5: Avaliação e decisão

- Análise completa das evidências
- Comparação com critérios de sucesso
- Decisão: expandir, ajustar ou desativar
- Documentação de lições aprendidas

---

## 12. Responsabilidades

### Responsável técnico

- Executar T13.2 (simulação com mocks)
- Configurar feature flag e allowlist
- Monitorar logs e métricas durante piloto
- Executar rollback se necessário
- Documentar evidências técnicas

### Responsável operacional (Escritório Oráculum)

- Autorizar início do piloto real
- Validar se caso piloto está elegível
- Revisar mensagens enviadas
- Avaliar qualidade das respostas
- Confirmar ausência de impactos negativos
- Autorizar expansão gradual

### Responsável pela validação humana

- Revisar evidências ao final do piloto
- Validar critérios de sucesso
- Identificar melhorias necessárias
- Tomar decisão final sobre expansão

---

## 13. Contatos e suporte

**Durante o piloto:**

- Qualquer anomalia deve ser reportada imediatamente
- Logs devem ser coletados antes e depois de qualquer incidente
- Rollback pode ser executado a qualquer momento sem aguardar análise
- Dúvidas operacionais devem ser direcionadas ao responsável do escritório

**Após o piloto:**

- Evidências serão consolidadas em documento final
- Reunião de retrospectiva para discutir resultados
- Plano de expansão (se aprovado) será documentado separadamente

---

## 14. Checklist de pré-piloto

Antes de autorizar o piloto real, confirmar:

- [ ] `POST_HUMAN_COMPLEMENTATION_ENABLED=false` configurada no `.env` e Render
- [ ] `POST_HUMAN_PILOT_CASES` definida com caso autorizado
- [ ] Template `caso_atualizacao_v3` validado no WABA
- [ ] Conexão PostgreSQL/Neon configurada e testada
- [ ] Migration `CREATE TABLE post_human_cycles` aplicada
- [ ] Vínculo Contato–Negócio do caso piloto confirmado
- [ ] T13.2 (simulação com mocks) executada e aprovada
- [ ] Evidências da simulação documentadas
- [ ] Rollback testado em ambiente de desenvolvimento
- [ ] Logs mascarados funcionando corretamente
- [ ] Autorização expressa do responsável operacional

**Somente prosseguir com piloto real após checklist 100% completa.**

---

**Documento controlado — Versão 1.0 — Não implementar sem autorização expressa**
