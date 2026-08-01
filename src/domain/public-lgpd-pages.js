"use strict"

const CONTACT_EMAIL = "oraculum.juridico@gmail.com"

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character])
}

function pageLayout({ title, description, currentPath, content }) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const nav = [
    ["/politica-de-privacidade", "Política de Privacidade"],
    ["/exclusao-de-dados", "Exclusão de Dados"]
  ].map(([href, label]) => `<a href="${href}"${href === currentPath ? ' aria-current="page"' : ""}>${label}</a>`).join("")

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${safeDescription}">
  <meta name="robots" content="index,follow">
  <title>${safeTitle} | Oráculum Advocacia</title>
  <style>
    :root{color-scheme:light;--ink:#17202a;--muted:#56616d;--paper:#fff;--soft:#f3f5f3;--brand:#173f35;--gold:#b9975b;--line:#dce2df;--focus:#0866c6}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--soft);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
    a{color:var(--brand);text-underline-offset:3px}a:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:3px}
    header{background:linear-gradient(135deg,#102f28,var(--brand));color:#fff;padding:2.5rem 1.25rem 4.5rem}header .wrap{max-width:960px;margin:auto}
    .brand{margin:0 0 1.5rem;font-size:.82rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#f2dfbd}.brand span{display:block;margin-top:.25rem;color:#fff;font-size:1.05rem;letter-spacing:.04em;text-transform:none}
    nav{display:flex;gap:.75rem;flex-wrap:wrap}nav a{color:#fff;padding:.55rem .8rem;border:1px solid #ffffff45;border-radius:999px;text-decoration:none;font-size:.9rem}nav a[aria-current="page"]{background:#fff;color:var(--brand);border-color:#fff;font-weight:700}
    main{max-width:960px;margin:-2.5rem auto 3rem;padding:0 1.25rem}.card{background:var(--paper);border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 50px #102f2814;padding:clamp(1.4rem,4vw,3rem)}
    h1{font-family:Georgia,serif;font-size:clamp(2rem,5vw,3.35rem);line-height:1.12;margin:0 0 1rem;color:var(--brand)}h2{font-family:Georgia,serif;color:var(--brand);line-height:1.25;margin:2.2rem 0 .6rem;font-size:1.55rem}
    .lead{font-size:1.12rem;color:var(--muted);max-width:760px}.updated{display:inline-block;margin:.5rem 0 1.25rem;padding:.3rem .7rem;border-radius:999px;background:#edf3f0;color:var(--brand);font-size:.84rem;font-weight:650}
    ul,ol{padding-left:1.35rem}li+li{margin-top:.45rem}.notice{margin:1.5rem 0;padding:1rem 1.1rem;border-left:4px solid var(--gold);background:#fbf8f1;border-radius:0 10px 10px 0}.contact{padding:1.2rem;border:1px solid var(--line);border-radius:12px;background:#f8faf9}.button{display:inline-block;margin-top:.5rem;padding:.7rem 1rem;background:var(--brand);color:#fff;border-radius:8px;text-decoration:none;font-weight:700}
    footer{max-width:960px;margin:0 auto;padding:0 1.25rem 2.5rem;color:var(--muted);font-size:.9rem}footer p{border-top:1px solid var(--line);padding-top:1.25rem}
    @media(max-width:520px){header{padding-top:1.7rem}.card{border-radius:14px}nav{display:grid;grid-template-columns:1fr}nav a{text-align:center}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style>
</head>
<body>
  <header><div class="wrap"><p class="brand">Oráculum<span>Advocacia e Consultoria Jurídica</span></p><nav aria-label="Páginas de privacidade">${nav}</nav></div></header>
  <main><article class="card">${content}</article></main>
  <footer><p>© ${new Date().getFullYear()} Oráculum Advocacia e Consultoria Jurídica · Atendimento com privacidade e segurança.</p></footer>
</body>
</html>`
}

function privacyPolicyPage() {
  const email = escapeHtml(CONTACT_EMAIL)
  return pageLayout({
    title: "Política de Privacidade",
    description: "Saiba como a Oráculum trata dados pessoais no atendimento jurídico pelo WhatsApp.",
    currentPath: "/politica-de-privacidade",
    content: `<h1>Política de Privacidade</h1>
      <p class="lead">Esta página explica, de forma simples, como usamos e protegemos os dados pessoais recebidos durante o atendimento jurídico.</p><span class="updated">Atualizada em agosto de 2026</span>
      <h2>1. Quem cuida dos seus dados</h2><p>A <strong>Oráculum Advocacia e Consultoria Jurídica</strong> é responsável pelo atendimento e pelas decisões sobre o uso dos dados pessoais descritos nesta política.</p>
      <h2>2. Por que usamos seus dados</h2><p>Usamos os dados para receber seu contato pelo WhatsApp, compreender a demanda, verificar conflitos de interesse, organizar documentos, preparar a análise jurídica, manter o histórico do atendimento, agendar conversas e cumprir obrigações legais e profissionais.</p><p>O envio de uma mensagem não cria automaticamente uma relação advogado-cliente. A contratação depende de confirmação específica do escritório.</p>
      <h2>3. Quais dados podem ser coletados</h2><ul><li>nome, telefone, e-mail, CPF e dados de identificação;</li><li>data de nascimento exata, endereço e informações de contato, quando necessárias;</li><li>relato do caso, área jurídica, partes envolvidas, prazos e outras informações fornecidas por você;</li><li>áudios, imagens e documentos enviados no atendimento;</li><li>dados técnicos mínimos, como protocolo, data, horário e estado do atendimento.</li></ul><p>Alguns casos podem envolver dados sensíveis, como informações de saúde. Solicitamos apenas o que for pertinente ao atendimento.</p>
      <h2>4. Ferramentas e operadores</h2><p>Para prestar e organizar o atendimento, podemos usar fornecedores que tratam dados sob nossas instruções e conforme a necessidade do serviço:</p><ul><li><strong>Meta/WhatsApp</strong>, para receber e enviar mensagens;</li><li><strong>HubSpot</strong>, para organizar contatos, demandas e andamento do atendimento;</li><li><strong>Google Drive</strong>, para armazenar pastas e documentos do caso;</li><li>serviços de hospedagem, banco de dados, e-mail, agenda, transcrição e apoio tecnológico.</li></ul><p>Esses fornecedores podem operar infraestrutura fora do Brasil. Nesses casos, adotamos medidas contratuais e de segurança compatíveis com a LGPD. Não vendemos seus dados pessoais.</p>
      <h2>5. Armazenamento e segurança</h2><p>Guardamos os dados pelo tempo necessário ao atendimento, à defesa de direitos, ao cumprimento de obrigações legais, regulatórias e profissionais ou a outras finalidades legítimas permitidas. Aplicamos controles de acesso, registros técnicos, validação de identidade, proteção de credenciais e medidas contra perda, alteração e acesso indevido.</p><div class="notice"><strong>Importante:</strong> nenhum sistema é totalmente livre de riscos. Se identificarmos incidente relevante, adotaremos as providências previstas em lei.</div>
      <h2>6. Seus direitos</h2><p>Nos termos da LGPD, você pode pedir, conforme o caso:</p><ul><li>confirmação de que tratamos seus dados e acesso a eles;</li><li>correção de dados incompletos, inexatos ou desatualizados;</li><li>informações sobre compartilhamento e sobre as consequências de não fornecer dados;</li><li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li><li>eliminação de dados tratados com consentimento, quando aplicável e ressalvadas as hipóteses legais de conservação;</li><li>revogação do consentimento, oposição e revisão de decisões automatizadas, quando aplicáveis.</li></ul>
      <h2>7. Como fazer uma solicitação</h2><p>Envie o pedido pelo e-mail abaixo. Para proteger seus dados, poderemos solicitar informações adicionais que permitam confirmar sua identidade. Responderemos pelo canal informado e explicaremos eventual impossibilidade total ou parcial de atendimento.</p><div class="contact"><strong>Canal de privacidade</strong><br><a href="mailto:${email}">${email}</a><br><a class="button" href="mailto:${email}?subject=Solicitação%20LGPD">Enviar solicitação</a></div>
      <h2>8. Exclusão de dados</h2><p>Consulte o procedimento detalhado na página <a href="/exclusao-de-dados">Exclusão de Dados</a>.</p>`
  })
}

function dataDeletionPage() {
  const email = escapeHtml(CONTACT_EMAIL)
  return pageLayout({
    title: "Exclusão de Dados",
    description: "Veja como solicitar a exclusão de dados pessoais mantidos pela Oráculum.",
    currentPath: "/exclusao-de-dados",
    content: `<h1>Exclusão de Dados</h1><p class="lead">Você pode pedir a exclusão dos seus dados pessoais. Este procedimento também atende solicitações relacionadas ao atendimento iniciado pelo WhatsApp.</p><span class="updated">Atualizada em agosto de 2026</span>
      <h2>Como solicitar</h2><ol><li>Envie um e-mail para <a href="mailto:${email}">${email}</a> com o assunto <strong>Solicitação de exclusão de dados</strong>.</li><li>Informe os dados mínimos indicados abaixo.</li><li>Aguarde a verificação de identidade e a confirmação do escritório.</li></ol><a class="button" href="mailto:${email}?subject=Solicitação%20de%20exclusão%20de%20dados">Solicitar exclusão</a>
      <h2>O que informar</h2><ul><li>nome completo;</li><li>número de WhatsApp usado no atendimento;</li><li>e-mail para resposta;</li><li>número do protocolo ou do caso, se existir;</li><li>descrição clara dos dados ou atendimentos abrangidos pelo pedido.</li></ul><div class="notice"><strong>Envie somente o necessário.</strong> Não anexe documento de identidade no primeiro contato. Se precisarmos confirmar sua identidade, informaremos um meio seguro e quais dados são indispensáveis.</div>
      <h2>Como o pedido será tratado</h2><p>Depois de confirmar a identidade e localizar os registros, avaliaremos o pedido nos sistemas usados no atendimento, incluindo WhatsApp, HubSpot, Google Drive e serviços de armazenamento relacionados.</p><p>Quando a exclusão for aplicável, removeremos ou tornaremos anônimos os dados abrangidos e solicitaremos as providências necessárias aos operadores envolvidos.</p>
      <h2>Quando alguns dados precisam ser mantidos</h2><p>A exclusão pode ser total ou parcial. Alguns registros podem ser conservados quando necessários para cumprir obrigação legal ou regulatória, exercer direitos em processo, manter deveres profissionais, prevenir fraude ou atender outra hipótese permitida pela LGPD. Nessa situação, o uso ficará limitado à finalidade que justifica a conservação.</p>
      <h2>Confirmação</h2><p>Você receberá no e-mail informado a confirmação de recebimento e, ao final, a resposta sobre as medidas adotadas. Se o pedido não puder ser atendido integralmente, explicaremos o motivo de forma clara.</p>
      <h2>Outros pedidos</h2><p>Para acesso, correção ou dúvidas sobre o tratamento, use o mesmo canal e consulte nossa <a href="/politica-de-privacidade">Política de Privacidade</a>.</p>`
  })
}

module.exports = { CONTACT_EMAIL, privacyPolicyPage, dataDeletionPage }
