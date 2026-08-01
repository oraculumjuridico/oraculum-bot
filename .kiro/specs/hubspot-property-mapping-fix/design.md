# HubSpot Property Mapping Bugfix Design

## Visão geral

Esta especificação corrige o contrato de mapeamento entre os dados coletados no fluxo assistido e as propriedades do HubSpot, sem introduzir novas abstrações de código. O objetivo é preservar dados válidos, rejeitar placeholders, tratar CPF corretamente, preservar dígitos válidos em telefones e garantir que a criação de caso só seja considerada concluída quando os identificadores essenciais existirem.

## Escopo

### Módulos existentes a considerar

- src/domain/hubspot-core.js
- função montarPropsContatoHubSpot
- src/domain/single-case-contact-reconciliation.js
- função reconcileSingleCaseContactCheckpoint
- fluxo existente de single-case-apply.js

### O que não deve ser proposto

- criação de src/domain/hubspot-property-mapper.js
- criação de src/domain/contact-reconciliation.js
- reconciliação dentro de contacts.create
- expansão de contacts.update como tarefa de implementação

## Decisões de design

### 1. Reconciliação

A reconciliação deve acontecer antes da criação, na camada de domínio, dentro do fluxo existente de single-case-apply.js e usando o módulo existente de single-case-contact-reconciliation.js.

### 2. Normalização de telefone

- Celular brasileiro com código do país pode ter 13 dígitos.
- Telefone fixo brasileiro com código do país pode ter 12 dígitos.
- Preserve todos os dígitos válidos.
- Não invente nem remova dígitos.
- Preserve o nono dígito do celular.
- Use a mesma forma canônica para busca, criação e atualização no HubSpot.
- A normalização específica da Meta permanece separada.

### 3. CPF

- vazio: omitir;
- válido: enviar;
- inválido: rejeitar;
- placeholder: rejeitar;
- ausência: não apagar valor existente.

### 4. Placeholders

A validação deve existir nas etapas de coleta, revisão, confirmação, invariantes, montagem de props, contrato do HubSpot, criação e atualização. Placeholders não podem virar informação confirmada, servir como identidade, chegar ao HubSpot ou apagar dados válidos.

### 5. Contrato de sucesso

Antes de mostrar “Caso criado com sucesso”, o fluxo deve exigir:

- numeroCaso;
- contactId ou contatoId;
- dealId ou negocioId;
- caseFolderId ou pastaDriveId.

Também deve preservar:

- FALLBACK_BLOCKED_PARTIAL_WRITES;
- IDs parciais;
- retomada idempotente;
- PRs #10 e #11.

### 6. Logs

Os logs devem normalizar contactId/contatoId, dealId/negocioId e caseFolderId/pastaDriveId. Devem registrar apenas dados técnicos e nunca CPF, telefone completo, e-mail, nome, relato, documentos, senhas ou credenciais.

## Fluxo previsto

1. Coleta de dados no atendimento assistido.
2. Validação de placeholders e CPF no fluxo de domínio.
3. Reconciliation antes da criação, no fluxo existente.
4. Montagem de propriedades no HubSpot usando montarPropsContatoHubSpot.
5. Criação/atualização de contato e deal sem abrir escopo para novos módulos.
6. Sucesso somente quando todos os IDs essenciais estiverem presentes.

## Critério de aceite

A especificação deve permanecer restrita aos módulos existentes e aos requisitos acima, sem introduzir soluções fora do escopo.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the 6 bug categories BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate admin-assisted data collection with valid data and placeholders. Mock the HubSpot adapter to capture payloads. Run these tests on the UNFIXED code to observe what payloads are actually generated vs. what should be generated.

**Test Cases**:

1. **Valid Name Discarding Test** (Bug Category 1)
   - Input: Collected data with nomeCompleto="Maria da Silva Santos"
   - Run through property mapping on unfixed code
   - Expected Counterexample: Payload has firstname="Lead WhatsApp" or firstname is missing
   - Confirms: Property mapping doesn't extract name components

2. **Placeholder Acceptance Test** (Bug Category 2)
   - Input: Collected data with email="email do cliente", telefone="informar depois"
   - Run through property mapping on unfixed code
   - Expected Counterexample: Payload includes email="email do cliente"
   - Confirms: Placeholder validation not applied at HubSpot boundary

3. **Phone Digit Removal Test** (Bug Category 4)
   - Input: Phone "5581987654321" (Recife, area code 81, with 9)
   - Run through normalizarNumeroWhatsAppEnvio on unfixed code
   - Expected Counterexample: Returns "558187654321" (12 digits - 9th digit removed)
   - Confirms: DDDS_SEM_NONO incorrectly includes area codes that should keep the digit

4. **Duplicate Contact Creation Test** (Bug Category 5)
   - Input: Create contact with cpf="52998224725" when a contact with same CPF exists
   - Mock adapter to return 1 match for findContactsByCpf
   - Run through contact creation flow on unfixed code
   - Expected Counterexample: Calls client.contacts.create instead of returning existing ID
   - Confirms: Reconciliation not performed before create

5. **Invalid CPF Sent Test** (Bug Category 6)
   - Input: CPF "11111111111" (all same digits - invalid)
   - Run through property mapping on unfixed code
   - Expected Counterexample: Payload includes cpf_do_cliente="11111111111"
   - Confirms: CPF validation not enforced before send

6. **Null Value Overwrites Test** (Bug Category 3)
   - Input: Update contact with properties={firstname: "João", telefone: null}
   - Existing contact has telefone="5581999999999"
   - Run through update logic on unfixed code
   - Expected Counterexample: Resulting contact has telefone="" (erased)
   - Confirms: Update doesn't filter out null/undefined values

**Expected Outcome**: All 6 test cases should FAIL on unfixed code, providing concrete counterexamples that demonstrate each bug category. These failures confirm our root cause hypotheses.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := processContactWithFix(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Testing Approach**: Use property-based testing to generate many variations of buggy inputs (valid data that should be mapped, placeholders that should be rejected, phones that should preserve digits, CPFs that should be validated, etc.) and verify all produce correct behavior.

**Test Categories**:

**1. Contact Property Mapping (Validates Property 1)**
- Generate random valid full names (2-5 words, proper capitalization)
- Verify firstname = first word, lastname = remaining words
- Generate single-word names, verify firstname = word, lastname = ""
- Generate names with accents/special chars, verify normalization applied
- Verify all identity fields (phone, cpf, email, city, state, birthdate) are mapped to correct properties

**2. Placeholder Rejection (Validates Property 2)**
- Generate all exact matches from PLACEHOLDERS_INVALIDOS set
- Generate variations matching REGEX_PLACEHOLDER_CAMPO pattern
- For each placeholder, verify it's omitted from HubSpot payload
- Generate mixed input (some valid, some placeholders), verify only valid fields included
- Test placeholder in each field type (name, phone, email, cpf, city, etc.)

**3. Value Substitution (Validates Property 3)**
- Generate update scenarios with new valid values, verify old values replaced
- Generate update scenarios with null/undefined/empty values, verify old values preserved
- Test partial updates (only some fields changed), verify unchanged fields preserved
- Test correction scenarios (admin fixes a typo), verify new value overwrites old

**4. Phone Digit Preservation (Validates Property 4)**
- Generate phones for all Brazilian area codes (11-99) with 9th digit
- Verify all result in 13-digit output starting with 55
- Test phones with various formatting (spaces, dashes, parentheses), verify cleaned but digits preserved
- Test international phones (non-Brazil), verify handled correctly or rejected
- Compare output of new normalizarTelefoneHubSpot vs old normalizarNumeroWhatsAppEnvio

**5. Contact Reconciliation (Validates Property 5)**
- Mock adapter to return 0 matches, verify create action returned
- Mock adapter to return 1 CPF match, verify update action with correct ID
- Mock adapter to return 1 phone match (no CPF match), verify update action
- Mock adapter to return 1 email match (no CPF/phone match), verify update action
- Test priority hierarchy: if CPF matches, don't search by phone
- Mock adapter to return >1 matches, verify AMBIGUOUS error thrown

**6. CPF Validation (Validates Property 6)**
- Generate valid CPFs (pass check digit algorithm), verify included in payload
- Generate invalid CPFs (wrong check digits), verify omitted from payload
- Test CPFs with formatting (xxx.xxx.xxx-xx), verify cleaned and validated
- Test repeated-digit CPFs (111.111.111-11), verify rejected
- Test CPFs with wrong length, verify rejected

**Expected Outcome**: All properties pass for all generated test cases, demonstrating that the fix correctly handles all bug condition scenarios.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT processContact_original(input) = processContact_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is CRITICAL for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: First observe behavior on UNFIXED code for non-contact-property operations (Drive, deals, webhooks, test mode). Then write property-based tests capturing that exact behavior and verify FIXED code produces identical results.

**Test Categories**:

**1. Drive Folder Creation Preservation (Validates Property 7)**
- Observe: Run Drive folder creation on unfixed code for various case names
- Capture: Folder names, normalization rules, uniqueness handling
- Property Test: Generate random case data, verify folder creation produces same names/structure
- Verify: All name normalization corrections from PRs #10, #11 still applied

**2. Deal Property Mapping Preservation (Validates Property 9)**
- Observe: Create deals on unfixed code with area_juridica, tipo_de_caso, resumo_cliente, descricao_completa
- Capture: Exact property names and values sent to HubSpot
- Property Test: Generate random deal data across all legal areas (INSS, Trabalhista, Família, etc.)
- Verify: Deal payload structure unchanged, all deal properties mapped identically

**3. Date Normalization Preservation (Validates Property 9)**
- Observe: Format dates on unfixed code (birth dates in dd/mm/yyyy, timestamps for events)
- Capture: Exact output format (ISO 8601 vs Unix timestamp)
- Property Test: Generate random dates in various input formats
- Verify: Same output format produced for same input format

**4. Test Safety Preservation (Validates Property 8)**
- Observe: Run full flow on unfixed code with realExternalActions=0
- Capture: Verify NO actual HubSpot API calls, NO Drive writes, NO WhatsApp sends
- Property Test: Generate random test scenarios
- Verify: Test mode enforcement identical, canary cases handled same way

**5. Case Number Reservation Preservation (Validates Property 7)**
- Observe: Reserve case numbers on unfixed code
- Capture: Number format (PRV.YYMMDD.NNN), uniqueness checks, sequentiality
- Property Test: Generate multiple reservation requests
- Verify: Same numbering logic, same uniqueness guarantees

**6. Webhook/Automation Preservation (Validates Property 7)**
- Observe: Trigger webhooks on unfixed code for various events
- Capture: Webhook payloads, timing, retry logic
- Property Test: Generate random event scenarios
- Verify: Same webhooks triggered with same payloads

**7. Association Creation Preservation (Not explicitly in requirements but critical)**
- Observe: Associate contacts with deals on unfixed code
- Capture: Association type (deal_to_contact), API calls made
- Property Test: Generate random contact+deal pairs
- Verify: Same association logic, same API calls

**8. WhatsApp Sending Preservation (Validates Property 7)**
- Observe: Format messages on unfixed code (but don't send - test mode)
- Capture: Template selection, variable substitution, rate limiting
- Property Test: Generate random message scenarios
- Verify: Same template logic, same rate limiting, same formatting
- NOTE: Use normalizarNumeroWhatsAppEnvio (with DDDS_SEM_NONO) for sending, not new normalizarTelefoneHubSpot

**Expected Outcome**: All preservation tests pass, demonstrating zero regressions in non-contact-property functionality.

### Unit Tests

**Contact Property Mapping**
- Test extracting firstname/lastname from full names (2 words, 3 words, 4+ words, single word)
- Test name normalization (capitalization, accent removal, whitespace handling)
- Test mapping nomeCompleto → firstname+lastname with various name formats
- Test mapping telefone → phone with various phone formats
- Test mapping cpf → cpf_do_cliente with valid CPFs only
- Test mapping email → email with valid emails only
- Test mapping cidade → city and uf → state
- Test mapping dataNascimento → date_of_birth with date normalization

**Placeholder Detection**
- Test exact matches from PLACEHOLDERS_INVALIDOS (all 16 literal placeholders)
- Test regex pattern matches (REGEX_PLACEHOLDER_CAMPO variations)
- Test case-insensitive matching ("Nome Do Cliente" should match "nome do cliente")
- Test placeholder in each field type (verify field omitted from payload)
- Test mixed valid+placeholder input (verify only valid fields included)

**Phone Normalization**
- Test normalizarTelefoneHubSpot with area codes 11-99
- Test phones with 9th digit are preserved (all 13 digits)
- Test phones without country code get 55 prepended
- Test phones with formatting characters are cleaned
- Test short phones (<10 digits) are rejected or handled
- Test normalizarNumeroWhatsAppEnvio still works for WhatsApp sending (DDDS_SEM_NONO logic preserved)

**CPF Validation**
- Test validCpf with all valid CPF patterns
- Test validCpf rejects repeated digits (111.111.111-11, etc.)
- Test validCpf rejects wrong check digits
- Test validCpf accepts unformatted CPFs (11 digits)
- Test validCpf rejects CPFs with wrong length
- Test CPF normalization (remove dots and dashes before validation)

**Contact Reconciliation**
- Test reconcileContact returns create when no matches found
- Test reconcileContact returns update with ID when 1 CPF match found
- Test reconcileContact returns update with ID when 1 phone match found (no CPF)
- Test reconcileContact throws AMBIGUOUS when >1 CPF matches found
- Test reconcileContact throws AMBIGUOUS when >1 phone matches found
- Test reconciliation hierarchy (CPF checked before phone)

**Value Substitution**
- Test update with valid new values replaces old values
- Test update with null values preserves old values
- Test update with undefined values preserves old values
- Test update with empty string values preserves old values
- Test update with valid empty string (e.g., clearing a note) works when explicitly allowed

### Property-Based Tests

**Property 1: Complete Contact Property Mapping**
- Generate arbitrary full names (Hypothesis/fast-check: strings with 1-5 words)
- Generate arbitrary phones (Brazilian format: 55 + 10-11 digits)
- Generate arbitrary valid CPFs (use CPF generation algorithm)
- Generate arbitrary emails (valid email format)
- For each generated input, verify all fields mapped to correct HubSpot properties
- Verify no valid data discarded

**Property 2: Placeholder Rejection**
- Generate arbitrary field values (mix of valid data and placeholders)
- For inputs containing placeholders, verify placeholder fields omitted
- For inputs containing only valid data, verify all fields included
- Test across all field types (name, phone, cpf, email, city, uf, etc.)

**Property 4: Phone Digit Preservation**
- Generate arbitrary Brazilian phone numbers (all area codes, with/without formatting)
- For all inputs, verify output has 13 digits (55 + 2 area code + 9 + 8 digits)
- Verify 9th digit never removed
- Verify only non-digit characters removed

**Property 5: Contact Reconciliation**
- Generate arbitrary contact data with CPF/phone/email
- Mock adapter to return 0, 1, or 2 matches for each lookup
- For 0 matches, verify create action
- For 1 match, verify update action with correct ID
- For 2+ matches, verify AMBIGUOUS error

**Property 6: CPF Validation**
- Generate valid CPFs (use CPF generation algorithm)
- Generate invalid CPFs (wrong check digits, repeated digits)
- For valid CPFs, verify included in payload
- For invalid CPFs, verify omitted from payload

**Property 7-9: Preservation Properties**
- Generate arbitrary case data (names, areas, dates, descriptions)
- Run through unfixed code, capture output (mocked - no real external calls)
- Run through fixed code, capture output
- Assert outputs are identical for all non-contact-property operations

### Integration Tests

**Full Admin-Assisted Flow with Valid Data**
- Simulate complete admin-assisted collection with real client data (Maria da Silva Santos, valid CPF, valid phone)
- Run through full pipeline: collection → validation → mapping → HubSpot adapter
- Verify contact created with firstname="Maria", lastname="da Silva Santos"
- Verify all properties mapped correctly
- Verify realExternalActions=0 enforced (no actual HubSpot write)

**Full Admin-Assisted Flow with Placeholders**
- Simulate collection with placeholders ("email do cliente", "informar depois" for phone)
- Run through full pipeline
- Verify placeholder fields omitted from HubSpot payload
- Verify only valid fields included in contact creation

**Contact Reconciliation Integration**
- Create test scenario with existing HubSpot contact (mocked) with CPF "52998224725"
- Simulate new contact creation with same CPF
- Verify reconciliation finds existing contact
- Verify update operation called instead of create
- Verify no duplicate contact created

**Deal+Contact Association Integration**
- Simulate creating contact, creating deal, and associating them
- Verify contact properties mapped correctly
- Verify deal properties preserved (not affected by contact fix)
- Verify association created with correct type (deal_to_contact)

**Canary Case Processing**
- Run PRV.260731.108 and PRV.260731.575 through full pipeline
- Verify treated as test cases (realExternalActions=0)
- Verify no real HubSpot/Drive/WhatsApp operations performed
- Verify logging indicates test mode active

**Drive Folder + HubSpot Contact Creation**
- Simulate creating case folder and HubSpot contact simultaneously
- Verify folder naming uses corrections from PRs #10, #11
- Verify contact properties mapped correctly
- Verify pasta_drive property set on both contact and deal
- Verify caseFolderId blocking works (FALLBACK_BLOCKED_PARTIAL_WRITES)
