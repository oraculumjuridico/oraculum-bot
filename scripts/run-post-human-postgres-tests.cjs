const { spawnSync } = require("child_process")

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error("Uso: node scripts/run-post-human-postgres-tests.cjs <arquivo> [arquivo...]")
  process.exit(1)
}

for (const file of args) {
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    env: { ...process.env, POST_HUMAN_POSTGRES_REQUIRED: "true" },
    stdio: "inherit"
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

process.exit(0)
