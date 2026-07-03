const path = require("node:path")

const root = path.join(__dirname, "..", "..")
const {
  assertConsultationArchitecture,
  assertConsultationReleaseIntegrity,
  CONSULTATION_VERSION
} = require("../domain/consultation")

const integrity = assertConsultationReleaseIntegrity({ root })
const architecture = assertConsultationArchitecture({ root })

console.log(JSON.stringify({
  event: "consultation_release_check",
  status: "ok",
  consultationVersion: CONSULTATION_VERSION,
  domainVersion: integrity.domainVersion,
  filesChecked: integrity.filesChecked,
  architectureFilesChecked: architecture.arquivosVerificados
}))
