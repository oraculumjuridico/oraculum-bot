const fs = require("fs")

const src = fs.readFileSync("server.js", "utf8")

const checks = [
  {
    nome: "entrada em documentos usa AGUARDANDO_DOCS",
    ok: /intencao === "documentos"[\s\S]*?hsMoverStage\(u\.negocioId, HS_STAGE\.AGUARDANDO_DOCS\)/.test(src)
  },
  {
    nome: "docs_intro_ok usa AGUARDANDO_DOCS",
    ok: /text === "docs_intro_ok"[\s\S]*?hsMoverStage\(u\.negocioId, HS_STAGE\.AGUARDANDO_DOCS\)/.test(src)
  },
  {
    nome: "PDF guiado conclui documento atual",
    ok: /arquivoEhPdf[\s\S]*?u\.docAtualIdx = arquivoEhPdf \? folhas\.length : fIdx \+ 1/.test(src)
  },
  {
    nome: "PDF nao mostra botao de mais fotos",
    ok: /opcoes: arquivoEhPdf[\s\S]*?\{ id:"docs_proxdoc", title: proximaAcaoTitle \}[\s\S]*?: \(rgAguardandoVerso/.test(src)
  },
  {
    nome: "pular documento nao conta como entregue",
    ok: /docsPulados/.test(src) &&
      /marcarStatusDocumento\(u, docPular\.id, pulouAntesDeEnviar \? "docsPulados" : "docsParciais"\)/.test(src) &&
      !/docsEntregues\.push/.test(src)
  },
  {
    nome: "botoes documentais principais cabem no WhatsApp",
    ok: /title: "Proxima pagina"/.test(removerAcentos(src)) &&
      /"Proximo documento"/.test(removerAcentos(src)) &&
      /title: "Nao tenho este"/.test(removerAcentos(src)) &&
      /title:"Enviar complemento"/.test(src) &&
      /title: "Continuar depois"/.test(src)
  },
  {
    nome: "RG/CNH permite verso junto ou seguir sem verso sem prender cliente",
    ok: /docs_rg_verso_junto/.test(src) &&
      /docs_rg_sem_verso/.test(src) &&
      /title: "Usar mesma foto"/.test(src) &&
      /title: "Seguir sem verso"/.test(src) &&
      /DOCUMENTO PARCIAL - CLIENTE SEGUIU SEM VERSO/.test(src)
  },
  {
    nome: "status documental centralizado com pulado parcial dispensado",
    ok: /function calcularStatusDocumentos/.test(src) &&
      /docsPulados/.test(src) &&
      /docsParciais/.test(src) &&
      /docsDispensados/.test(src) &&
      /faltantesCriticos/.test(src)
  },
  {
    nome: "tela documental separa guia visual do documento atual",
    ok: /Guia do status/.test(src) &&
      /completos/.test(src) &&
      /em andamento/.test(src) &&
      /Falta/.test(src) &&
      !/n[aã]o enviado\/parcial/.test(removerAcentos(src))
  },
  {
    nome: "tela de documento recebido usa imagem e andamento",
    ok: /IMAGEM_DOC_RECEBIDO_URL = "https:\/\/i\.imgur\.com\/91SqyKX\.png"/.test(src) &&
      /Andamento do envio/.test(src) &&
      /enviarImagemWhatsApp\(from, IMAGEM_DOC_RECEBIDO_URL/.test(src)
  },
  {
    nome: "audio documental evita documento do documento",
    ok: /function fraseEnvioDocumentoAudio/.test(src) &&
      /Foto do documento/.test(src) &&
      !/Agora envie \$\{folha\} do documento/.test(src)
  },
  {
    nome: "CPF nao duplica texto de pular documento",
    ok: /doc\.id === "doc_cpf"[\s\S]*?doc_cpf_skip/.test(src) &&
      !/Se o seu CPF j[aá] aparece no RG ou CNH, pode pular este documento/.test(src)
  },
  {
    nome: "final de documentos usa imagem aprovada e lista faltantes",
    ok: /IMAGEM_DOCS_FINAL_URL = "https:\/\/i\.imgur\.com\/LRvw2m8\.png"/.test(src) &&
      /Ainda faltam/.test(src)
  },
  {
    nome: "documentos faltantes podem ser reabertos depois",
    ok: /function getDocsFaltantesReenviaveis/.test(src) &&
      /function reabrirDocsFaltantesReenviaveis/.test(src) &&
      /IMAGEM_DOCS_PENDENTES_URL = "https:\/\/i\.imgur\.com\/mKmFGHO\.png"/.test(src) &&
      /function telaDocsPendentesComImagem/.test(src) &&
      /docs_enviar_faltantes/.test(src) &&
      /DOCUMENTOS FALTANTES REABERTOS PARA ENVIO/.test(src) &&
      /text === "docs_intro_ok"[\s\S]*?getDocsFaltantesReenviaveis\(u\)\.length > 0[\s\S]*?telaDocsPendentesComImagem\(u\)[\s\S]*?enviarImagemWhatsApp/.test(src)
  },
  {
    nome: "acoes documentais possuem audio em modo voz",
    ok: /"reenviar documento"/.test(src) &&
      /"complementar documento"/.test(src) &&
      /"continuar documentos depois"/.test(src) &&
      /"observacao documento"/.test(src) &&
      /"audio observacao documento"/.test(src)
  },
  {
    nome: "texto documental e documento ausente sao tratados",
    ok: /DOCUMENTO INFORMADO COMO AUSENTE/.test(src) && /INFORMACAO DOCUMENTAL RECEBIDA/.test(src)
  },
  {
    nome: "audio no fluxo documental vira observacao",
    ok: /OBSERVACAO EM AUDIO SOBRE DOCUMENTO/.test(src)
  },
  {
    nome: "documento avulso nasce pendente e pode ser renomeado",
    ok: /Aguardando classificacao/.test(src) && /renomearArquivoDrive/.test(src)
  },
  {
    nome: "selecionar caso preserva acao pendente antes de documentos",
    ok: /const acaoPendente = u\._acaoPendente \|\| null[\s\S]*?if \(acaoPendente\) return await executarAcaoPendenteCliente/.test(src)
  },
  {
    nome: "health publico minimo e health interno protegido",
    ok: /app\.get\("\/health", \(_, res\) => res\.json\(\{ status: "ok", version: "Oraculum v6\.4" \}\)\)/.test(src) &&
      /app\.get\("\/health-interno", validarWebhookInterno/.test(src)
  }
]

function removerAcentos(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

let falhas = 0
console.log("Verificacao documental Oraculum Bot\n")

for (const check of checks) {
  if (check.ok) {
    console.log(`OK - ${check.nome}`)
  } else {
    falhas++
    console.error(`FALHA - ${check.nome}`)
  }
}

if (falhas) {
  console.error(`\n${falhas} falha(s) encontrada(s).`)
  process.exit(1)
}

console.log("\nTudo ok no fluxo documental.")
