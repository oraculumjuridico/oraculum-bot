/**
 * Disparador gratuito do agendador interno do Oráculum.
 *
 * Em "Configurações do projeto > Propriedades do script", cadastre:
 * ORACULUM_BASE_URL=https://SEU-SERVICO.onrender.com
 * INTERNAL_WEBHOOK_SECRET=o-mesmo-segredo-do-Render
 *
 * Execute instalarTrigger() uma única vez.
 */
function processarAgendamentosOraculum() {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = String(props.getProperty("ORACULUM_BASE_URL") || "").replace(/\/$/, "");
  const secret = props.getProperty("INTERNAL_WEBHOOK_SECRET");
  if (!baseUrl || !secret) throw new Error("Propriedades do agendador ausentes");

  const response = UrlFetchApp.fetch(baseUrl + "/internal/processar-agendamentos", {
    method: "post",
    contentType: "application/json",
    headers: { "x-internal-secret": secret },
    payload: "{}",
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error("Oráculum respondeu HTTP " + status);
}

function instalarTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === "processarAgendamentosOraculum")
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("processarAgendamentosOraculum")
    .timeBased()
    .everyMinutes(5)
    .create();
}
