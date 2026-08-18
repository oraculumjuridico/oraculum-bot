const {
  sanitizarTextoEntrada,
  normalizarTextoGatilho
} = require("../utils/text")

const DOCS_BASE = [
  {
    id:"doc_rg", label:"RG ou CNH",
    folhas:["Frente","Verso"],
    dica:"📸 Pode enviar frente e verso na mesma imagem, se aparecerem completos. Se estiverem separados, envie uma foto por vez. Sem reflexo, sem partes cortadas."
  },
  {
    id:"doc_cpf", label:"CPF",
    folhas:["Frente"],
    opcional: true,
    dica:"📸 Se o CPF já aparece no RG ou CNH, pode pular. Se tiver o cartão separado, tire foto nítida."
  },
  {
    id:"doc_res", label:"Comprovante de Residência",
    folhas:["Foto do documento"],
    dica:"📸 Conta de luz, água ou telefone dos últimos 3 meses. Foto completa, todos os dados visíveis."
  }
]
const DOCS_EXTRA = {
  "aposentadoria": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos. Envie cada uma"],
      dica:"📒 Fotografe a folha de rosto (seus dados) e TODAS as páginas com registros de emprego, uma foto por página. Frente e verso se tiver anotação dos dois lados." },
    { id:"doc_cnis", label:"Extrato CNIS (Meu INSS)", folhas:["Todas as páginas"],
      dica:"📱 App Meu INSS → Extrato de Contribuições. Tire print de TODAS as páginas ou salve como PDF e envie aqui." },
    { id:"doc_hol", label:"Holerites (12 meses)", folhas:["Cada holerite separado"],
      dica:"💰 Envie um holerite por foto. Se digitais, print de cada um. Valores devem estar legíveis." }
  ],
  "bpc": [
    { id:"doc_laudo", label:"Laudo Médico Atualizado", folhas:["Todas as páginas"],
      dica:"🏥 Todas as páginas do laudo, sem partes cortadas. Validade máxima: 6 meses." },
    { id:"doc_renda", label:"Declaração de Renda Familiar", folhas:["Foto do documento"],
      dica:"📄 Pode ser feita no CRAS ou pelo app Meu INSS. Envie completa." },
    { id:"doc_nasc", label:"Certidão de Nascimento", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso, sobre fundo escuro." }
  ],
  "incapacidade": [
    { id:"doc_atst", label:"Atestado Médico Recente", folhas:["Foto do documento"],
      dica:"🏥 Foto completa com CRM do médico visível. Máximo 90 dias de validade." },
    { id:"doc_exam", label:"Exames e Laudos", folhas:["Cada exame separado"],
      dica:"🔬 Um exame por foto. Resultados devem estar completamente legíveis." },
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + todas as páginas com anotações, uma por vez." }
  ],
  "dependentes": [
    { id:"doc_obito", label:"Certidão de Óbito", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso, sobre fundo escuro." },
    { id:"doc_nasc", label:"Certidão de Nascimento", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso." }
  ],
  "negado": [
    { id:"doc_indf", label:"Carta de Indeferimento do INSS", folhas:["Todas as páginas"],
      dica:"📄 Foto completa. Se pelo app Meu INSS, print de todas as telas." },
    { id:"doc_ant", label:"Documentos do Pedido Anterior", folhas:["Cada documento separado"],
      dica:"📁 Todos os documentos do pedido anterior ao INSS, um por foto." }
  ],
  "cortado": [
    { id:"doc_susp", label:"Carta de Suspensão do Benefício", folhas:["Todas as páginas"],
      dica:"📄 Foto da notificação completa recebida do INSS." },
    { id:"doc_laudo", label:"Laudos Médicos Recentes", folhas:["Cada laudo separado"],
      dica:"🏥 Laudos com até 6 meses. Todas as páginas de cada laudo." }
  ],
  "demissao": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + todas as páginas com anotações de emprego." },
    { id:"doc_demit", label:"Carta de Demissão", folhas:["Todas as páginas"],
      dica:"📄 Documento completo, assinado pela empresa." },
    { id:"doc_hol", label:"Últimos 3 Holerites", folhas:["Holerite mais recente","Holerite 2","Holerite 3"],
      dica:"💰 Um holerite por foto, valores legíveis." },
    { id:"doc_fgts", label:"Extrato FGTS", folhas:["Todas as páginas"],
      dica:"📱 App FGTS → Extratos. Todas as páginas ou PDF." }
  ],
  "direitos": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + todas as páginas com registros." },
    { id:"doc_hol", label:"Holerites", folhas:["Cada holerite separado"],
      dica:"💰 Um por foto, todos legíveis." },
    { id:"doc_fgts", label:"Extrato FGTS", folhas:["Todas as páginas"],
      dica:"📱 App FGTS → Extratos. Todas as páginas." },
    { id:"doc_ctr", label:"Contrato de Trabalho", folhas:["Cada página separada"],
      dica:"📝 Todas as páginas assinadas, frente e verso." }
  ],
  "acidente": [
    { id:"doc_cat", label:"CAT (Comunicação de Acidente)", folhas:["Todas as páginas"],
      dica:"📋 Documento CAT completo. Se não tiver, informe ao advogado." },
    { id:"doc_atst", label:"Atestado Médico", folhas:["Foto do documento"],
      dica:"🏥 Foto nítida com CRM do médico visível." },
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + páginas com registros." }
  ],
  "assedio": [
    { id:"doc_print", label:"Prints ou Registros", folhas:["Cada print separado"],
      dica:"📱 Um print por foto, organizados por data." },
    { id:"doc_test", label:"Nomes de Testemunhas", folhas:["Mensagem de texto"],
      dica:"✍️ Digite aqui os nomes e telefones de quem presenciou os fatos." },
    { id:"doc_hol", label:"Contracheques", folhas:["Cada um separado"],
      dica:"💰 Um por foto, legíveis." }
  ],
  "revisao": [
    { id:"doc_orig", label:"Documento para Revisão", folhas:["Cada página separada"],
      dica:"📄 Todas as páginas em fotos separadas, ou envie como PDF." }
  ],

  // -- Família ------------------------------------------------------
  "divorcio": [
    { id:"doc_casam", label:"Certidão de Casamento", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso, sobre fundo escuro." },
    { id:"doc_renda_fam", label:"Comprovante de Renda", folhas:["Foto do documento"],
      dica:"💰 Contracheque, extrato bancário ou declaração de IR dos últimos 3 meses." },
    { id:"doc_nasc_filhos", label:"Certidão de Nascimento dos Filhos", folhas:["Frente","Verso"],
      dica:"📜 Uma foto por certidão, frente e verso." }
  ],
  "pensao": [
    { id:"doc_nasc_filho", label:"Certidão de Nascimento do Filho", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso." },
    { id:"doc_renda_fam", label:"Comprovante de Renda do Alimentante", folhas:["Foto do documento"],
      dica:"💰 Contracheque ou extrato bancário recente do responsável pelo pagamento." },
    { id:"doc_guarda", label:"Decisão Judicial de Guarda (se houver)", folhas:["Cada página separada"],
      dica:"📄 Caso já exista decisão judicial sobre guarda, envie todas as páginas." }
  ],
  "guarda": [
    { id:"doc_nasc_filho", label:"Certidão de Nascimento do Filho", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso." },
    { id:"doc_escola", label:"Comprovante Escolar da Criança", folhas:["Foto do documento"],
      dica:"📚 Declaração de matrícula ou boletim recente." },
    { id:"doc_resid_filho", label:"Comprovante de Residência Atual da Criança", folhas:["Foto do documento"],
      dica:"🏠 Conta de luz, água ou telefone do endereço onde a criança mora." }
  ],
  "inventario": [
    { id:"doc_obito_fam", label:"Certidão de Óbito", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso, sobre fundo escuro." },
    { id:"doc_bens", label:"Documentos dos Bens (imóveis, veículos, contas)", folhas:["Cada documento separado"],
      dica:"📁 Escritura, CRLV, extrato bancário. Envie um documento por foto." },
    { id:"doc_herd", label:"Certidões de Nascimento / Casamento dos Herdeiros", folhas:["Cada certidão separada"],
      dica:"📜 Uma foto por documento, frente e verso." }
  ],
  "familia": [
    { id:"doc_casam", label:"Certidão de Casamento ou Nascimento", folhas:["Frente","Verso"],
      dica:"📜 Conforme o caso, envie o documento original, frente e verso." },
    { id:"doc_renda_fam", label:"Comprovante de Renda", folhas:["Foto do documento"],
      dica:"💰 Contracheque, extrato bancário ou declaração de IR dos últimos 3 meses." },
    { id:"doc_fam_outros", label:"Documentos Relacionados ao Caso", folhas:["Cada documento separado"],
      dica:"📁 Decisões judiciais, acordos, notificações. Envie um documento por foto." }
  ],

  // -- Consumidor ---------------------------------------------------
  "cobranca": [
    { id:"doc_boleto", label:"Boleto ou Extrato com a Cobrança", folhas:["Foto do documento"],
      dica:"📄 Foto completa do boleto ou print do extrato com a cobrança destacada." },
    { id:"doc_contrato_cons", label:"Contrato ou Termo de Serviço", folhas:["Cada página separada"],
      dica:"📋 Todas as páginas do contrato, uma por foto ou PDF." },
    { id:"doc_print_cons", label:"Prints de Comunicação com a Empresa", folhas:["Cada print separado"],
      dica:"📱 Prints de e-mail, chat, WhatsApp ou protocolo de atendimento." }
  ],
  "produto": [
    { id:"doc_nf", label:"Nota Fiscal ou Cupom Fiscal", folhas:["Foto do documento"],
      dica:"🧾 Foto legível da nota fiscal ou print do e-mail de confirmação de compra." },
    { id:"doc_foto_prod", label:"Foto do Produto com Defeito", folhas:["Cada foto separada"],
      dica:"📸 Fotografe o defeito de ângulos diferentes, com boa iluminação." },
    { id:"doc_print_troca", label:"Prints da Tentativa de Troca ou Devolução", folhas:["Cada print separado"],
      dica:"📱 Prints de e-mail, chat ou protocolo com a loja ou fabricante." }
  ],
  "banco": [
    { id:"doc_extrato", label:"Extrato Bancário com o Lançamento", folhas:["Foto do documento"],
      dica:"💳 Print ou foto do extrato mostrando claramente a cobrança ou débito." },
    { id:"doc_contrato_banco", label:"Contrato Bancário (se houver)", folhas:["Cada página separada"],
      dica:"📋 Contrato de empréstimo, cartão ou conta. Todas as páginas." },
    { id:"doc_print_banco", label:"Prints do Aplicativo ou Comunicação com o Banco", folhas:["Cada print separado"],
      dica:"📱 Prints do app, e-mail ou protocolo de atendimento." }
  ],
  "consumidor": [
    { id:"doc_nf", label:"Nota Fiscal, Contrato ou Comprovante", folhas:["Foto do documento"],
      dica:"🧾 Foto legível do documento que comprova a relação com a empresa." },
    { id:"doc_print_cons", label:"Prints de Comunicação com a Empresa", folhas:["Cada print separado"],
      dica:"📱 Prints de e-mail, chat, WhatsApp ou protocolo de atendimento." },
    { id:"doc_cons_outros", label:"Outros Documentos do Caso", folhas:["Cada documento separado"],
      dica:"📁 Boletos, extratos, fotos do produto. Envie um documento por foto." }
  ],

  // -- Penal --------------------------------------------------------
  "vitima": [
    { id:"doc_bo", label:"Boletim de Ocorrência", folhas:["Todas as páginas"],
      dica:"📋 Todas as páginas do BO registrado na delegacia." },
    { id:"doc_laudo_penal", label:"Laudo Pericial ou Médico (se houver)", folhas:["Cada página separada"],
      dica:"🏥 Laudos do IML ou médico que atendeu. Todas as páginas." },
    { id:"doc_print_penal", label:"Prints ou Registros das Ameaças / Agressões", folhas:["Cada print separado"],
      dica:"📱 Prints de mensagens, fotos de lesões ou qualquer outro registro." }
  ],
  "acusado": [
    { id:"doc_intimacao", label:"Intimação ou Notificação Judicial", folhas:["Todas as páginas"],
      dica:"📄 Documento recebido do fórum ou delegacia, todas as páginas." },
    { id:"doc_proc_penal", label:"Documentos do Processo (se houver)", folhas:["Cada página separada"],
      dica:"📁 Peças processuais recebidas, uma página por foto ou PDF." },
    { id:"doc_testemunhas", label:"Dados de Testemunhas (se houver)", folhas:["Mensagem de texto"],
      dica:"✍️ Digite aqui nomes e telefones de quem pode testemunhar a seu favor." }
  ],
  "penal": [
    { id:"doc_bo", label:"Boletim de Ocorrência ou Intimação", folhas:["Todas as páginas"],
      dica:"📋 Documento da delegacia ou fórum, todas as páginas." },
    { id:"doc_proc_penal", label:"Documentos do Processo (se houver)", folhas:["Cada página separada"],
      dica:"📁 Peças processuais, notificações ou laudos. Envie um documento por foto." },
    { id:"doc_penal_outros", label:"Outros Registros do Caso", folhas:["Cada documento separado"],
      dica:"📱 Prints, fotos ou qualquer outro registro relacionado ao caso." }
  ],

  // -- Civil --------------------------------------------------------
  "contrato_civil": [
    { id:"doc_contrato_civ", label:"Contrato ou Acordo", folhas:["Cada página separada"],
      dica:"📋 Todas as páginas do contrato, assinadas, uma por foto ou PDF." },
    { id:"doc_notif", label:"Notificação Extrajudicial (se houver)", folhas:["Todas as páginas"],
      dica:"📄 Notificação enviada ou recebida, todas as páginas." },
    { id:"doc_print_civ", label:"Prints ou Registros de Comunicação", folhas:["Cada print separado"],
      dica:"📱 E-mails, mensagens ou qualquer registro da negociação ou descumprimento." }
  ],
  "indenizacao": [
    { id:"doc_prova_dano", label:"Provas do Dano Sofrido", folhas:["Cada documento separado"],
      dica:"📸 Fotos, laudos, prints ou qualquer documento que comprove o dano." },
    { id:"doc_contrato_civ", label:"Contrato ou Acordo (se houver)", folhas:["Cada página separada"],
      dica:"📋 Todas as páginas, uma por foto ou PDF." },
    { id:"doc_print_civ", label:"Prints ou Registros de Comunicação", folhas:["Cada print separado"],
      dica:"📱 E-mails, mensagens ou comprovantes da situação." }
  ],
  "divida": [
    { id:"doc_contrato_div", label:"Contrato ou Comprovante da Dívida", folhas:["Cada página separada"],
      dica:"📋 Contrato, boleto ou qualquer documento que comprove a dívida." },
    { id:"doc_extrato_div", label:"Extrato ou Demonstrativo de Saldo", folhas:["Foto do documento"],
      dica:"💰 Extrato atualizado com saldo devedor." },
    { id:"doc_notif_div", label:"Notificação de Cobrança (se houver)", folhas:["Todas as páginas"],
      dica:"📬 Carta, e-mail ou notificação recebida sobre a dívida." }
  ],
  "civil": [
    { id:"doc_contrato_civ", label:"Contrato, Acordo ou Documento Principal do Caso", folhas:["Cada página separada"],
      dica:"📋 Todas as páginas do documento, uma por foto ou PDF." },
    { id:"doc_prova_civ", label:"Provas ou Registros do Caso", folhas:["Cada documento separado"],
      dica:"📁 Prints, fotos, laudos ou notificações relacionados ao caso." },
    { id:"doc_civ_outros", label:"Outros Documentos Relevantes", folhas:["Cada documento separado"],
      dica:"📁 Qualquer outro documento que possa apoiar seu caso." }
  ],

  // -- Imobiliário --------------------------------------------------
  "imovel_compra": [
    { id:"doc_escritura", label:"Escritura ou Contrato de Compra e Venda", folhas:["Cada página separada"],
      dica:"📜 Todas as páginas, uma por foto ou envie como PDF." },
    { id:"doc_rgi", label:"Registro de Imóvel (RGI / Matrícula)", folhas:["Cada página separada"],
      dica:"📋 Certidão de matrícula atualizada do cartório de imóveis." },
    { id:"doc_iptu", label:"IPTU do Imóvel", folhas:["Foto do documento"],
      dica:"🏠 Carnê ou boleto do IPTU com dados do imóvel visíveis." }
  ],
  "aluguel": [
    { id:"doc_contrato_alug", label:"Contrato de Locação", folhas:["Cada página separada"],
      dica:"📋 Todas as páginas do contrato assinado, uma por foto ou PDF." },
    { id:"doc_recibo_alug", label:"Recibos de Aluguel (últimos 3 meses)", folhas:["Cada recibo separado"],
      dica:"💰 Um recibo por foto, valores e datas legíveis." },
    { id:"doc_notif_alug", label:"Notificação ou Comunicação com o Proprietário", folhas:["Cada documento separado"],
      dica:"📬 Cartas, e-mails ou mensagens sobre o aluguel." }
  ],
  "usucapiao": [
    { id:"doc_posse", label:"Documentos que Comprovam a Posse", folhas:["Cada documento separado"],
      dica:"📁 Contas de consumo, declarações de vizinhos, fotos do imóvel ocupado." },
    { id:"doc_iptu", label:"IPTU ou Carnê de IPTU (se pago)", folhas:["Foto do documento"],
      dica:"🏠 Comprovante de pagamento de IPTU ao longo dos anos, se houver." },
    { id:"doc_rgi", label:"Certidão de Matrícula do Imóvel", folhas:["Cada página separada"],
      dica:"📋 Certidão atualizada do cartório de imóveis (pode solicitar mesmo sem ser dono)." }
  ],
  "imovel": [
    { id:"doc_escritura", label:"Escritura, Contrato ou Documento do Imóvel", folhas:["Cada página separada"],
      dica:"📜 Contrato de compra e venda, escritura ou contrato de locação. Todas as páginas." },
    { id:"doc_iptu", label:"IPTU ou Carnê do Imóvel", folhas:["Foto do documento"],
      dica:"🏠 Carnê ou boleto do IPTU com dados do imóvel visíveis." },
    { id:"doc_imov_outros", label:"Outros Documentos do Caso", folhas:["Cada documento separado"],
      dica:"📁 Notificações, recibos, prints ou registros relacionados ao imóvel." }
  ],

  // -- Outros -------------------------------------------------------
  "outros": [
    { id:"doc_out_princ", label:"Documento Principal do Caso", folhas:["Cada página separada"],
      dica:"📄 O documento mais importante do seu caso. Todas as páginas, uma por foto ou PDF." },
    { id:"doc_out_provas", label:"Provas ou Registros do Caso", folhas:["Cada documento separado"],
      dica:"📁 Prints, fotos, contratos ou qualquer registro que apoie seu caso." }
  ]
}
function normalizarChaveDoc(area, tipo, situacao, detalhe) {
  // Mapeamento de valores da IA para chaves do DOCS_EXTRA
  const mapa = {
    // INSS
    "negado": "negado",
    "benefício negado": "negado",
    "beneficio negado": "negado",
    "indeferido": "negado",
    "cortado": "cortado",
    "suspenso": "cortado",
    "benefício suspenso": "cortado",
    "beneficio suspenso": "cortado",
    "aposentadoria": "aposentadoria",
    "aposentar": "aposentadoria",
    "bpc": "bpc",
    "bpc/loas": "bpc",
    "loas": "bpc",
    "incapacidade": "incapacidade",
    "auxílio-doença": "incapacidade",
    "auxilio-doenca": "incapacidade",
    "invalidez": "incapacidade",
    "dependentes": "dependentes",
    "pensão por morte": "dependentes",
    "pensao por morte": "dependentes",
    // Trabalhista
    "demissão": "demissao",
    "demissao": "demissao",
    "demitido": "demissao",
    "rescisão": "demissao",
    "rescisao": "demissao",
    "direitos": "direitos",
    "direitos não pagos": "direitos",
    "direitos nao pagos": "direitos",
    "horas extras": "direitos",
    "fgts": "direitos",
    "acidente": "acidente",
    "acidente de trabalho": "acidente",
    "assédio": "assedio",
    "assedio": "assedio",
    "assédio moral": "assedio",
    "assedio moral": "assedio",
    // Família
    "divórcio": "divorcio",
    "divorcio": "divorcio",
    "separação": "divorcio",
    "separacao": "divorcio",
    "pensão alimentícia": "pensao",
    "pensao alimenticia": "pensao",
    "alimentos": "pensao",
    "guarda": "guarda",
    "guarda de filhos": "guarda",
    "inventário": "inventario",
    "inventario": "inventario",
    "herança": "inventario",
    "heranca": "inventario",
    "família": "familia",
    "familia": "familia",
    // Consumidor
    "cobrança indevida": "cobranca",
    "cobranca indevida": "cobranca",
    "cobrança": "cobranca",
    "cobranca": "cobranca",
    "produto com defeito": "produto",
    "defeito": "produto",
    "troca": "produto",
    "banco": "banco",
    "financeira": "banco",
    "cartão de crédito": "banco",
    "cartao de credito": "banco",
    "consumidor": "consumidor",
    // Penal
    "vítima": "vitima",
    "vitima": "vitima",
    "ameaça": "vitima",
    "ameaca": "vitima",
    "agressão": "vitima",
    "agressao": "vitima",
    "acusado": "acusado",
    "processo criminal": "acusado",
    "preso": "acusado",
    "penal": "penal",
    "crime": "penal",
    "delegacia": "penal",
    "boletim de ocorrência": "penal",
    "boletim de ocorrencia": "penal",
    // Civil
    "contrato": "contrato_civil",
    "descumprimento de contrato": "contrato_civil",
    "indenização": "indenizacao",
    "indenizacao": "indenizacao",
    "dano moral": "indenizacao",
    "dívida": "divida",
    "divida": "divida",
    "cobrança de dívida": "divida",
    "civil": "civil",
    // Imobiliário
    "compra de imóvel": "imovel_compra",
    "compra de imovel": "imovel_compra",
    "financiamento imobiliário": "imovel_compra",
    "financiamento imobiliario": "imovel_compra",
    "aluguel": "aluguel",
    "locação": "aluguel",
    "locacao": "aluguel",
    "despejo": "aluguel",
    "usucapião": "usucapiao",
    "usucapiao": "usucapiao",
    "imóvel": "imovel",
    "imovel": "imovel",
    "imobiliário": "imovel",
    "imobiliario": "imovel",
    // Outros
    "outros": "outros",
  }

  function normalizarTextoDoc(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
  }

  const mapaNormalizado = Object.fromEntries(
    Object.entries(mapa).map(([chave, valor]) => [normalizarTextoDoc(chave), valor])
  )

  function resolverValor(v) {
    if (!v) return null
    const texto = normalizarTextoDoc(v)
    if (mapaNormalizado[texto]) return mapaNormalizado[texto]
    for (const [chave, valor] of Object.entries(mapaNormalizado)) {
      if (texto.includes(chave) || chave.includes(texto)) return valor
    }
    return null
  }

  // Em INSS, negativa/suspensao define a lista e a imagem antes do tipo do beneficio.
  // Ex.: "aposentadoria negada" deve usar a chave "negado", nao "aposentadoria".
  if (area === "INSS") {
    const contextoInss = [situacao, detalhe, tipo].map(normalizarTextoDoc).filter(Boolean).join(" ")
    if (/\b(negad[oa]s?|indeferid[oa]s?|recusad[oa]s?|rejeitad[oa]s?|nao aprovado|nao aprovada|nao concedid[oa]s?)\b/.test(contextoInss)) {
      return "negado"
    }
    if (/\b(cortad[oa]s?|suspens[oa]s?|suspendid[oa]s?|cancelad[oa]s?|cessad[oa]s?|bloquead[oa]s?)\b/.test(contextoInss)) {
      return "cortado"
    }
  }

  const valores = [tipo, situacao, detalhe]
  for (const v of valores) {
    const resolvido = resolverValor(v)
    if (resolvido) return resolvido
  }

  // Fallback por área
  if (area === "INSS") return "negado"
  if (area === "Trabalhista") return "demissao"
  if (area === "Família") return "familia"
  if (area === "Consumidor") return "consumidor"
  if (area === "Penal") return "penal"
  if (area === "Civil") return "civil"
  if (area === "Imobiliário") return "imovel"
  if (area === "Outros") return "outros"
  return null
}

function chaveDocumentosCaso(u = {}) {
  const docKey = sanitizarTextoEntrada(u._docKey)
  if (docKey && DOCS_EXTRA[docKey]) {
    const areasPorDocKey = {
      aposentadoria: "INSS", bpc: "INSS", incapacidade: "INSS", negado: "INSS", cortado: "INSS", dependentes: "INSS",
      demissao: "Trabalhista", direitos: "Trabalhista", acidente: "Trabalhista", assedio: "Trabalhista",
      divorcio: "Família", pensao: "Família", guarda: "Família", inventario: "Família", familia: "Família",
      cobranca: "Consumidor", produto: "Consumidor", banco: "Consumidor", consumidor: "Consumidor",
      vitima: "Penal", acusado: "Penal", penal: "Penal",
      contrato_civil: "Civil", indenizacao: "Civil", divida: "Civil", civil: "Civil",
      imovel_compra: "Imobiliário", aluguel: "Imobiliário", usucapiao: "Imobiliário", imovel: "Imobiliário",
      outros: "Outros"
    }
    if (!u.area || areasPorDocKey[docKey] === u.area) return docKey
  }
  return normalizarChaveDoc(u.area, u.tipo, u.situacao, u.detalhe)
}

function inferirGrupoDocumento(doc = {}) {
  if (doc.grupo) return doc.grupo
  const id = String(doc.id || "")
  const label = String(doc.label || "").toLowerCase()
  if (["doc_rg", "doc_cpf", "doc_res"].includes(id)) return "Documentos pessoais"
  if (/indeferimento|suspens|corte|cessa|rescis|contrato|certid|boletim|processo|protocolo|carta|notifica|matr[ií]cula/.test(label)) {
    return "Documentos principais"
  }
  if (/laudo|atestado|exame|holerite|fgts|cnis|carteira|ctps|extrato|recibo|comprovante|print|conversa|mensagem|foto|prova/.test(label)) {
    return "Provas e comprovantes"
  }
  return "Complementares"
}

function inferirAceitaDocumento(doc = {}) {
  if (doc.aceita) return Array.isArray(doc.aceita) ? doc.aceita.join(", ") : String(doc.aceita)
  const label = String(doc.label || "").toLowerCase()
  const dica = String(doc.dica || "").toLowerCase()
  const texto = `${label} ${dica}`
  if (/app|print|meu inss|fgts|cnis|whatsapp|conversa|mensagem/.test(texto)) return "foto, PDF ou print"
  if (/áudio|audio/.test(texto)) return "áudio ou arquivo"
  return "foto ou PDF"
}

function normalizarDocumentoGuia(doc = {}, idx = 0) {
  const grupo = inferirGrupoDocumento(doc)
  const aceita = inferirAceitaDocumento(doc)
  return {
    ...doc,
    grupo,
    aceita,
    prioridade: doc.prioridade || idx + 1,
    obrigatorio: doc.obrigatorio !== undefined ? Boolean(doc.obrigatorio) : !doc.opcional,
    audio: doc.audio || null
  }
}

function getDocumentosLista(area, tipo, situacao = null, detalhe = null) {
  const chave = normalizarChaveDoc(area, tipo, situacao, detalhe) ||
                (tipo || situacao || area || "outros").toLowerCase()
  const extra = DOCS_EXTRA[chave] || [{ id:"doc_out", label:"Documentos do seu caso", folhas:["Cada documento separado"], dica:"📸 Envie os documentos relacionados ao seu caso." }]
  const lista = chave === "revisao" ? extra : [...DOCS_BASE, ...extra]
  return lista.map(normalizarDocumentoGuia)
}

function getDocumentosListaCaso(u = {}) {
  const chave = chaveDocumentosCaso(u) ||
                (u.tipo || u.situacao || u.area || "outros").toLowerCase()
  const extra = DOCS_EXTRA[chave] || [{ id:"doc_out", label:"Documentos do seu caso", folhas:["Cada documento separado"], dica:"📸 Envie os documentos relacionados ao seu caso." }]
  const lista = chave === "revisao" ? extra : [...DOCS_BASE, ...extra]
  return lista.map(normalizarDocumentoGuia)
}

function getDocumentos(area, tipo, situacao = null, detalhe = null) {
  return getDocumentosLista(area, tipo, situacao, detalhe).map(d => "- " + d.label).join("\n")
}

function getDocumentosCaso(u = {}) {
  return getDocumentosListaCaso(u).map(d => "- " + d.label).join("\n")
}

function criarContextoDocsCasoAtual(u = {}, numeroCaso = null) {
  return {
    numeroCaso: numeroCaso || u.numeroCaso || null,
    negocioId: u.negocioId || null,
    area: u.area || null,
    tipo: u.tipo || null,
    situacao: u.situacao || null,
    subTipo: u.subTipo || null,
    detalhe: u.detalhe || null,
    _docKey: u._docKey || normalizarChaveDoc(u.area, u.tipo, u.situacao, u.detalhe)
  }
}

function aplicarContextoDocsCasoAtual(u) {
  const ctx = u?._contextoDocsCasoAtual
  if (!ctx?.numeroCaso || ctx.numeroCaso !== u.numeroCaso) return false
  Object.assign(u, {
    area: ctx.area || u.area,
    tipo: ctx.tipo || u.tipo,
    situacao: ctx.situacao || u.situacao,
    subTipo: ctx.subTipo || u.subTipo,
    detalhe: ctx.detalhe || u.detalhe,
    _docKey: ctx._docKey || u._docKey
  })
  return true
}

function detectarComandoDocumento(texto = "") {
  const raw = String(texto || "").trim()
  if (["doc_cpf_skip", "docs_reenviar", "docs_maisFotos", "docs_proxdoc", "docs_pular_doc", "docs_depois", "docs_rg_verso_junto", "docs_rg_sem_verso", "docs_enviar_faltantes", "docs_ver_status", "docs_outros"].includes(raw)) return raw
  const t = normalizarTextoGatilho(raw)
  if (/\bpular documento\b|\bpular esse documento\b|\bnao enviar esse documento\b|\bnão enviar esse documento\b|\bproximo documento sem\b|\bseguir para outro documento\b/.test(t)) return "docs_pular_doc"
  if (/\b(enviar|mandar|anexar|adicionar)?\s*(outros? documentos?|documentos? adicionais?|documentos? complementares?)\b/.test(t)) return "docs_outros"
  if (/\bpular cpf\b/.test(t)) return "doc_cpf_skip"
  if (/\benviar faltantes\b|\benviar pendentes\b|\bmandar faltantes\b|\bmandar pendentes\b/.test(t)) return "docs_enviar_faltantes"
  if (/\bver status\b|\bstatus dos documentos\b|\bstatus documental\b/.test(t)) return "docs_ver_status"
  if (/\breenviar\b|\brefazer\b|\bmandar de novo\b/.test(t)) return "docs_reenviar"
  if (/\bmais fotos?\b|\boutra foto\b|\badicionar foto\b/.test(t)) return "docs_maisFotos"
  if (/\bpausar envio\b|\bpausar\b|\benviar depois\b|\bdepois\b|\bmais tarde\b/.test(t)) return "docs_depois"
  if (/\bverso junto\b|\bverso esta junto\b|\bverso est[aá] junto\b|\bfrente e verso junto\b|\bfrente e verso na mesma\b/.test(t)) return "docs_rg_verso_junto"
  if (/\bseguir sem verso\b|\bsem verso\b|\bnao tenho verso\b|\bnão tenho verso\b/.test(t)) return "docs_rg_sem_verso"
  if (/\bproxim[oa] documento\b|\bpr[oó]ximo documento\b|\bavancar documento\b|\bavançar documento\b/.test(t)) return "docs_proxdoc"
  return null
}

function listaIdsDocumento(u, campo) {
  return Array.isArray(u?.[campo]) ? u[campo].filter(Boolean) : []
}

function removerIdDocumentoDeListas(u, id, listas = []) {
  if (!u || !id) return
  for (const lista of listas) {
    if (!Array.isArray(u[lista])) u[lista] = []
    u[lista] = u[lista].filter(item => item !== id)
  }
}

function marcarStatusDocumento(u, id, campo) {
  if (!u || !id || !campo) return
  const listas = ["docsEntregues", "docsAusentes", "docsPulados", "docsParciais", "docsDispensados"]
  removerIdDocumentoDeListas(u, id, listas.filter(lista => lista !== campo))
  if (!Array.isArray(u[campo])) u[campo] = []
  if (!u[campo].includes(id)) u[campo].push(id)
}

function garantirListasDocumentos(u) {
  if (!u) return
  for (const lista of ["docsEntregues", "docsAusentes", "docsPulados", "docsParciais", "docsDispensados"]) {
    if (!Array.isArray(u[lista])) u[lista] = []
  }
}

function calcularStatusDocumentos(u) {
  const lista = getDocumentosListaCaso(u)
  const porId = new Map(lista.map(doc => [doc.id, doc]))
  const recebidosIds = new Set(listaIdsDocumento(u, "docsEntregues"))
  const ausentesIds = new Set(listaIdsDocumento(u, "docsAusentes"))
  const puladosIds = new Set(listaIdsDocumento(u, "docsPulados"))
  const parciaisIds = new Set(listaIdsDocumento(u, "docsParciais"))
  const dispensadosIds = new Set(listaIdsDocumento(u, "docsDispensados"))
  const resolvidosIds = new Set([...recebidosIds, ...ausentesIds, ...puladosIds, ...parciaisIds, ...dispensadosIds])
  const porStatus = ids => [...ids].map(id => porId.get(id)).filter(Boolean)
  const faltantesCriticos = lista.filter(doc =>
    doc.obrigatorio !== false &&
    !dispensadosIds.has(doc.id) &&
    !recebidosIds.has(doc.id)
  )
  return {
    lista,
    total: lista.length,
    recebidos: porStatus(recebidosIds),
    ausentes: porStatus(ausentesIds),
    pulados: porStatus(puladosIds),
    parciais: porStatus(parciaisIds),
    dispensados: porStatus(dispensadosIds),
    pendentesFluxo: lista.filter(doc => !resolvidosIds.has(doc.id)),
    faltantesCriticos,
  }
}

function getDocsPendentes(u) {
  return calcularStatusDocumentos(u).pendentesFluxo
}

function getDocsFaltantesReenviaveis(u) {
  const statusDocs = calcularStatusDocumentos(u)
  const porId = new Map()
  for (const doc of statusDocs.pulados) porId.set(doc.id, { doc, status: "nao enviado" })
  for (const doc of statusDocs.ausentes) porId.set(doc.id, { doc, status: "informado como ausente" })
  for (const doc of statusDocs.parciais) porId.set(doc.id, { doc, status: "recebido parcialmente" })
  return [...porId.values()]
}

function removerIdsDocumento(u, campo, ids) {
  if (!u || !Array.isArray(u[campo])) return
  const remover = new Set(ids)
  u[campo] = u[campo].filter(id => !remover.has(id))
}

function reabrirDocsFaltantesReenviaveis(u) {
  const faltantes = getDocsFaltantesReenviaveis(u)
  const ids = faltantes.map(item => item.doc.id)
  removerIdsDocumento(u, "docsPulados", ids)
  removerIdsDocumento(u, "docsAusentes", ids)
  removerIdsDocumento(u, "docsParciais", ids)
  u.docAtualIdx = 0
  u.ultimoArqId = null
  u.ultimoArqNome = null
  u._docsClienteGuiado = true
  u.etapa = "documentos"
  return faltantes
}

function getDocumentoAtualGuia(u) {
  const pendentes = getDocsPendentes(u)
  const doc = pendentes[0] || null
  const folhas = doc?.folhas || ["Foto"]
  const fIdx = u?.docAtualIdx || 0
  return {
    doc,
    pendentes,
    folhas,
    fIdx,
    folha: folhas[fIdx] || `Foto ${fIdx + 1}`
  }
}

function documentoAtualAceitaTexto(doc = {}) {
  const folhas = Array.isArray(doc.folhas) ? doc.folhas.join(" ") : ""
  const aceita = String(doc.aceita || "")
  const dica = String(doc.dica || "")
  return /mensagem de texto|digite|nomes?|telefones?|texto/i.test(`${folhas} ${aceita} ${dica}`)
}

function textoIndicaDocumentoAusente(texto = "") {
  const t = normalizarTextoGatilho(texto)
  return /\b(nao tenho|nao possuo|nao consegui|nao encontro|perdi|sem esse documento|sem o documento|nao achei|nao tenho esse)\b/.test(t)
}

module.exports = {
  DOCS_BASE,
  DOCS_EXTRA,
  normalizarChaveDoc,
  chaveDocumentosCaso,
  inferirGrupoDocumento,
  inferirAceitaDocumento,
  normalizarDocumentoGuia,
  getDocumentosLista,
  getDocumentosListaCaso,
  getDocumentos,
  getDocumentosCaso,
  criarContextoDocsCasoAtual,
  aplicarContextoDocsCasoAtual,
  detectarComandoDocumento,
  listaIdsDocumento,
  removerIdDocumentoDeListas,
  marcarStatusDocumento,
  garantirListasDocumentos,
  calcularStatusDocumentos,
  getDocsPendentes,
  getDocsFaltantesReenviaveis,
  removerIdsDocumento,
  reabrirDocsFaltantesReenviaveis,
  getDocumentoAtualGuia,
  documentoAtualAceitaTexto,
  textoIndicaDocumentoAusente
}
