const { isPostHumanComplementationEnabled } = require("../src/domain/post-human-feature-flag");

function runTest(name, envValue, expected) {
  const original = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED;
  if (envValue === undefined) {
    delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED;
  } else {
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = envValue;
  }
  delete require.cache[require.resolve("../src/domain/post-human-feature-flag")];
  const { isPostHumanComplementationEnabled: fn } = require("../src/domain/post-human-feature-flag");
  const result = fn();
  const pass = result === expected;
  console.log(`${pass ? "PASS" : "FAIL"}: ${name} — env="${envValue}" expected=${expected} got=${result}`);
  if (!pass) {
    console.error(`  EXPECTED ${expected} but got ${result}`);
    process.exitCode = 1;
  }
  if (original === undefined) {
    delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED;
  } else {
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = original;
  }
}

console.log("=== T1.1 Feature Flag Tests ===");

runTest("variável ausente", undefined, false);
runTest("variável vazia", "", false);
runTest("false", "false", false);
runTest("true", "true", true);
runTest("TRUE (maiúsculas)", "TRUE", true);
runTest("True (capitalizado)", "True", true);
runTest("valor inválido", "maybe", false);
runTest("número 1", "1", false);
runTest("número 0", "0", false);
runTest("whitespace", "  true  ", false);

const originalNodeEnv = process.env.NODE_ENV;
const originalFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED;
delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED;
process.env.NODE_ENV = "production";
console.log(`${isPostHumanComplementationEnabled() ? "PASS" : "FAIL"}: produção sem configuração explícita habilita o piloto controlado`);
if (!isPostHumanComplementationEnabled()) process.exitCode = 1;
if (originalFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = originalFlag;
if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;

console.log("=== Fim dos testes ===");
