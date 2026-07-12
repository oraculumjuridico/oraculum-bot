const assert = require("node:assert/strict");
const { logSegurancaAdmin, configurarAdminAuth } = require("../src/domain/admin-auth");
const { logInfo, mascararTelefoneLog } = require("../src/utils/logging");

async function executarTestes() {
  // Test 1: Phone masking utility works correctly
  assert.equal(mascararTelefoneLog("5511999999999"), "5511*****9999", "Phone should be masked as XXXX*****XXXX");
  assert.equal(mascararTelefoneLog("551199999999"), "5511*****9999", "Phone without special chars should mask");
  assert.equal(mascararTelefoneLog(""), "", "Empty phone should return empty string");
  assert.equal(mascararTelefoneLog(null), "", "Null phone should return empty string");
  assert.equal(mascararTelefoneLog("123"), "", "Short phone should return empty string");

  // Test 2: Admin security logs are masked
  const securityLogs = [];
  const originalWarn = console.warn;
  console.warn = msg => securityLogs.push(String(msg));

  try {
    configurarAdminAuth({
      WHATSAPP_ADMIN: "5511999999999",
      sessoesAdminWhatsApp: new Map(),
      sessoesAdminAutenticadas: new Map(),
      tentativasAdminWhatsApp: new Map(),
      normalizarNumeroWhatsAppEnvio: v => v
    });

    // Simulate security events
    logSegurancaAdmin("5511999999999", "senha incorreta");
    logSegurancaAdmin("5511999999999", "admin autenticado");
    logSegurancaAdmin("5511999999999", "logout manual");
    logSegurancaAdmin("5511999999999", "admin bloqueado por tentativas");

    // Verify masking in logs
    securityLogs.forEach(log => {
      assert.ok(!log.includes("5511999999999"), `Full phone number found in log: ${log}`);
      assert.ok(log.includes("5511*****9999"), `Masked phone not found in log: ${log}`);
    });

    assert.equal(securityLogs.length, 4, "Should have 4 security log entries");
  } finally {
    console.warn = originalWarn;
  }

  // Test 3: logInfo masks phone when present
  const infoDirect = logInfo({
    event: "test.event",
    phone: "5511888888888"
  });
  assert.equal(infoDirect.phoneMasked, "5511*****8888", "Phone should be masked in logInfo");
  assert.ok(infoDirect.event === "test.event", "Event should be preserved");

  // Test 4: logInfo handles missing phone gracefully
  const infoMissing = logInfo({
    event: "test.event",
    route: "/test"
  });
  assert.equal(infoMissing.phoneMasked, "", "Missing phone should result in empty masked phone");
  assert.ok(infoMissing.event === "test.event", "Event should still be preserved");

  // Test 5: phoneMasked parameter takes priority over phone
  const infoPriority = logInfo({
    event: "test.event",
    phoneMasked: "5511*****7777",
    phone: "5511777777777"
  });
  assert.equal(infoPriority.phoneMasked, "5511*****7777", "phoneMasked should take priority");

  // Test 6: Verify structured logging output doesn't expose full phone
  const structuredLogs = [];
  const originalLog = console.log;
  console.log = msg => {
    try {
      const parsed = JSON.parse(String(msg));
      structuredLogs.push(parsed);
    } catch {}
  };

  try {
    logInfo({
      event: "operational.test",
      phone: "5511777777777",
      dealId: "deal-123"
    });

    const logEntry = structuredLogs[structuredLogs.length - 1];
    assert.ok(logEntry, "Should have structured log entry");
    assert.ok(!logEntry.phoneMasked.includes("5511777777777"), "Full phone should not appear in structured log");
    assert.equal(logEntry.phoneMasked, "5511*****7777", "Masked phone should appear in structured log");
  } finally {
    console.log = originalLog;
  }

  console.log("admin-security-logging.test.js: ok");
}

executarTestes().catch(err => {
  console.error(err);
  process.exit(1);
}).then(() => process.exit(0));
