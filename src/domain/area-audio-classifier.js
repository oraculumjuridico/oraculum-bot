const axios = require("axios")
const { DOCS_EXTRA } = require("./documents-core")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logErro } = require("../utils/logging")

const { GROQ_KEY } = process.env

async function classificarAreaAudio(texto) {
  const fallback = {
    area: "Outros",
    confianca: 0.5,
    urgencia: "normal",
    situacao: null,
    detalhe: null,
    docKey: null,
    recebebeneficio: null,
    recebe_beneficio: null,
    contribuicao: null
  }

  if (!GROQ_KEY || !texto) return fallback

  try {
    const system = `Você é um assistente jurídico especialista. Analise cuidadosamente a descrição do caso e extraia as informações. Responda APENAS JSON válido com estas chaves exatas:
- "area": exatamente uma de: INSS, Trabalhista, Família, Consumidor, Penal, Civil, Imobiliário, Outros
  * INSS: aposentadoria, benefício previdenciário, BPC/LOAS, auxílio-doença, pensão por morte
  * Trabalhista: demissão, FGTS, horas extras, acidente de trabalho, assédio moral, direitos trabalhistas
  * Família: divórcio, guarda de filhos, pensão alimentícia, inventário, herança
  * Consumidor: cobrança indevida, produto com defeito, serviço não prestado, banco, financeira
  * Penal: crime, prisão, boletim de ocorrência, delegacia, processo criminal
  * Civil: dívida, contrato, indenização, dano moral (não relacionado a consumidor/trabalho)
  * Imobiliário: imóvel, aluguel, despejo, usucapião, financiamento imobiliário
  * Outros: casos que não se encaixam em nenhuma categoria acima
- "confianca": número entre 0 e 1
- "urgencia": exatamente uma de: alta, normal, baixa
- "situacao": resumo em 2-3 palavras do problema principal (ex: "benefício negado", "demissão sem causa", "acidente de trabalho")
- "detalhe": SEMPRE preencha quando houver contexto suficiente. Use termos jurídicos simples descrevendo complicadores ou detalhes específicos do caso (ex: "adoecimento ocupacional e FGTS irregular", "BPC/LOAS negado indevidamente", "horas extras não pagas", "assédio moral com afastamento"). Deixe null APENAS se realmente não houver nenhuma informação adicional relevante.
- "docKey": escolha exatamente uma chave documental quando possível: aposentadoria, bpc, incapacidade, negado, cortado, dependentes, demissao, direitos, acidente, assedio, divorcio, pensao, guarda, inventario, familia, cobranca, produto, banco, consumidor, vitima, acusado, penal, contrato_civil, indenizacao, divida, civil, imovel_compra, aluguel, usucapiao, imovel, outros
- "recebe_beneficio": true, false ou null se não mencionado
- "contribuicao": "nunca", "pouco_tempo", "mais_1_ano", "muitos_anos" ou null se não mencionado

IMPORTANTE: O campo "detalhe" deve capturar agravantes, complicadores, direitos violados ou contexto adicional relevante. Nunca deixe vazio se o relato mencionar problemas de saúde, direitos trabalhistas, irregularidades ou situações específicas.

Exemplos de relatos coloquiais que você DEVE saber classificar corretamente:
- "fui mandado embora sem receber nada" → {"area":"Trabalhista","confianca":0.95,"urgencia":"normal","situacao":"demissão sem verbas","detalhe":"rescisão sem pagamento de verbas trabalhistas","docKey":"demissao","recebe_beneficio":null,"contribuicao":null}
- "meu beneficio do inss foi cortado e to sem renda" → {"area":"INSS","confianca":0.97,"urgencia":"alta","situacao":"benefício cortado","detalhe":"suspensão de benefício previdenciário sem renda","docKey":"cortado","recebe_beneficio":false,"contribuicao":null}
- "minha mulher quer separar e tem filho pequeno" → {"area":"Família","confianca":0.92,"urgencia":"normal","situacao":"divórcio com guarda","detalhe":"divórcio litigioso com disputa de guarda de menor","docKey":"divorcio","recebe_beneficio":null,"contribuicao":null}
- "comprei um produto e nunca chegou empresa nao responde" → {"area":"Consumidor","confianca":0.95,"urgencia":"normal","situacao":"produto não entregue","detalhe":"empresa não cumpriu entrega e não responde ao consumidor","docKey":"produto","recebe_beneficio":null,"contribuicao":null}
- "me botaram pra fora da empresa semana passada" → {"area":"Trabalhista","confianca":0.95,"urgencia":"normal","situacao":"demissão sem causa","detalhe":"demissão recente sem motivo declarado","docKey":"demissao","recebe_beneficio":null,"contribuicao":null}
- "to tentando me aposentar mas o inss nega toda vez" → {"area":"INSS","confianca":0.97,"urgencia":"normal","situacao":"aposentadoria negada","detalhe":"pedidos de aposentadoria reiteradamente indeferidos pelo INSS","docKey":"negado","recebe_beneficio":false,"contribuicao":null}
- "meu patrão nao ta pagando meu salario faz dois meses" → {"area":"Trabalhista","confianca":0.96,"urgencia":"alta","situacao":"salário atrasado","detalhe":"dois meses de salário em atraso pelo empregador","docKey":"direitos","recebe_beneficio":null,"contribuicao":null}
- "vizinho invadiu meu terreno e construiu na minha area" → {"area":"Imobiliário","confianca":0.93,"urgencia":"normal","situacao":"invasão de terreno","detalhe":"construção irregular em área de propriedade do cliente","docKey":"imovel","recebe_beneficio":null,"contribuicao":null}`

    const user = `Descrição do caso: ${texto}`

    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 280,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )

    const resultado = JSON.parse(res.data.choices[0].message.content)

    const AREAS_VALIDAS = ["INSS", "Trabalhista", "Família", "Consumidor", "Penal", "Civil", "Imobiliário", "Outros"]
    const docKey = sanitizarTextoEntrada(resultado.docKey)
    return {
      area: AREAS_VALIDAS.includes(resultado.area) ? resultado.area : "Outros",
      confianca: resultado.confianca || 0.5,
      urgencia: ["alta", "normal", "baixa"].includes(resultado.urgencia)
        ? resultado.urgencia : "normal",
      situacao: resultado.situacao || null,
      detalhe: resultado.detalhe || null,
      docKey: docKey && DOCS_EXTRA[docKey] ? docKey : null,
      recebe_beneficio: resultado.recebe_beneficio ?? null,
      contribuicao: resultado.contribuicao || null
    }
  } catch (e) {
    logErro("groq", "classificarAreaAudio: " + e.message)
    return fallback
  }
}

module.exports = {
  classificarAreaAudio
}
