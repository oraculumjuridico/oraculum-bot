const assert = require("node:assert/strict")

const {
  ORIGEM_LEGAL_ASSISTANT,
  consultarAssistenteJuridico
} = require("../src/domain/legal-assistant-engine")

const registry = {
  documentos: [
    {
      registryId: "rg-1",
      fileId: "file-rg",
      nome: "RG Maria.pdf",
      tipoDocumento: "RG frente",
      status: "vigente",
      vigente: true,
      atualizadoEm: "2026-07-08T10:00:00.000Z",
      versoes: [{
        extracao: {
          camposExtraidos: {
            nome: "Maria da Silva",
            cpf: "123.456.789-09"
          }
        }
      }]
    },
    {
      registryId: "laudo-antigo",
      fileId: "file-laudo-1",
      nome: "Laudo antigo.pdf",
      tipoDocumento: "Laudo medico",
      status: "vigente",
      vigente: true,
      atualizadoEm: "2026-07-07T10:00:00.000Z",
      versoes: [{ extracao: { camposExtraidos: {} } }]
    },
    {
      registryId: "laudo-novo",
      fileId: "file-laudo-2",
      nome: "Laudo recente.pdf",
      tipoDocumento: "Laudo medico",
      status: "vigente",
      vigente: true,
      atualizadoEm: "2026-07-08T11:00:00.000Z",
      versoes: [{ extracao: { camposExtraidos: {} } }]
    }
  ],
  metadados: {
    area_juridica: "inss",
    pastaDriveLink: "https://drive.example/pasta"
  },
  pdfs: [{
    tipo: "Dossie",
    arquivo: "dossie.pdf",
    drive: {
      webViewLink: "https://drive.example/dossie.pdf"
    }
  }]
}

const checklist = {
  percentualCompleto: 67,
  recebidos: [{ item: "RG" }, { item: "CPF" }],
  pendentes: [{ item: "CNIS" }]
}

const divergences = {
  divergencias: [{
    campo: "cpf",
    gravidade: "ALTA"
  }]
}

const dossier = {
  caso: {
    area: "INSS",
    tipo: "Auxilio por incapacidade"
  },
  documentacao: {
    percentual: 67
  },
  links: {
    pastaDrive: "https://drive.example/pasta",
    pdfs: [{
      arquivo: "dossie.pdf",
      webViewLink: "https://drive.example/dossie.pdf"
    }]
  }
}

async function main() {
  const base = {
    contexto: {
      registry,
      checklist,
      divergences,
      dossier
    }
  }

  const consultaChecklist = await consultarAssistenteJuridico({
    pergunta: "quais documentos faltam",
    ...base
  })
  assert.equal(consultaChecklist.origem, ORIGEM_LEGAL_ASSISTANT.CHECKLIST)
  assert.match(consultaChecklist.resposta, /CNIS/)
  assert.equal(consultaChecklist.usouIA, false)

  const consultaPercentual = await consultarAssistenteJuridico({
    pergunta: "qual percentual da documentacao",
    ...base
  })
  assert.equal(consultaPercentual.origem, ORIGEM_LEGAL_ASSISTANT.CHECKLIST)
  assert.match(consultaPercentual.resposta, /67%/)

  const consultaRegistry = await consultarAssistenteJuridico({
    pergunta: "qual cpf",
    ...base
  })
  assert.equal(consultaRegistry.origem, ORIGEM_LEGAL_ASSISTANT.REGISTRY)
  assert.match(consultaRegistry.resposta, /123\.456\.789-09/)
  assert.equal(consultaRegistry.usouIA, false)

  const consultaUltimoLaudo = await consultarAssistenteJuridico({
    pergunta: "qual ultimo laudo",
    ...base
  })
  assert.equal(consultaUltimoLaudo.origem, ORIGEM_LEGAL_ASSISTANT.REGISTRY)
  assert.match(consultaUltimoLaudo.resposta, /Laudo recente/)

  const consultaDossie = await consultarAssistenteJuridico({
    pergunta: "qual area do caso",
    ...base
  })
  assert.equal(consultaDossie.origem, ORIGEM_LEGAL_ASSISTANT.DOSSIER)
  assert.match(consultaDossie.resposta, /INSS/)
  assert.equal(consultaDossie.usouIA, false)

  const consultaDivergencia = await consultarAssistenteJuridico({
    pergunta: "ha divergencias",
    ...base
  })
  assert.equal(consultaDivergencia.origem, ORIGEM_LEGAL_ASSISTANT.DIVERGENCES)
  assert.match(consultaDivergencia.resposta, /cpf/)
  assert.equal(consultaDivergencia.usouIA, false)

  let chamadasGroq = 0
  const fallbackIA = await consultarAssistenteJuridico({
    pergunta: "resuma esse caso",
    ...base
  }, {
    consultarGroq: async ({ pergunta, contexto }) => {
      chamadasGroq += 1
      assert.equal(pergunta, "resuma esse caso")
      assert.equal(contexto.registry, registry)
      return "Resumo operacional gerado."
    }
  })
  assert.equal(fallbackIA.origem, ORIGEM_LEGAL_ASSISTANT.GROQ)
  assert.equal(fallbackIA.resposta, "Resumo operacional gerado.")
  assert.equal(fallbackIA.usouIA, true)
  assert.equal(chamadasGroq, 1)

  const desconhecida = await consultarAssistenteJuridico({
    pergunta: "qual a melhor estrategia processual",
    ...base
  })
  assert.equal(desconhecida.origem, ORIGEM_LEGAL_ASSISTANT.DESCONHECIDA)
  assert.equal(desconhecida.usouIA, false)

  const semPergunta = await consultarAssistenteJuridico({
    pergunta: "",
    contexto: {}
  })
  assert.equal(semPergunta.origem, ORIGEM_LEGAL_ASSISTANT.DESCONHECIDA)
  assert.equal(semPergunta.usouIA, false)
}

main()
  .then(() => console.log("legal-assistant-engine.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
