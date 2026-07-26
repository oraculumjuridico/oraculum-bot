"use strict"

const fs = require("node:fs")
const path = require("node:path")
const dotenv = require("dotenv")

const ENV_FILE_NAME = "oraculum-bot.env"
const PRIVATE_KEY_ENV = "SINGLE_CASE_APPLY_PRIVATE_KEY_PEM"

function loadOperationalEnvironment({ processEnv = process.env, envFilePath = path.resolve(__dirname, "..", "..", ENV_FILE_NAME) } = {}) {
  let fileEnv
  try { fileEnv = dotenv.parse(fs.readFileSync(envFilePath, "utf8")) } catch { throw new Error("ORACULUM_OPERATIONAL_ENV_UNAVAILABLE") }
  // The signing key is never sourced from disk by operational commands. It must
  // be explicitly provisioned in the current process by the operational window.
  delete fileEnv[PRIVATE_KEY_ENV]
  const effective = { ...processEnv, ...fileEnv }
  if (typeof processEnv[PRIVATE_KEY_ENV] === "string" && processEnv[PRIVATE_KEY_ENV].trim()) effective[PRIVATE_KEY_ENV] = processEnv[PRIVATE_KEY_ENV]
  return Object.freeze(effective)
}

module.exports = { ENV_FILE_NAME, PRIVATE_KEY_ENV, loadOperationalEnvironment }
