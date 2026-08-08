const assert = require("node:assert/strict")

const {
  DOCUMENT_STATE_FILE,
  DOCUMENT_STATE_FOLDER,
  DOCUMENT_STATE_VERSION,
  salvarEstadoDocumental,
  carregarEstadoDocumental,
  atualizarEstadoDocumental,
  estadoExiste
} = require("../src/domain/document-state-repository")

function criarDeps(arquivos = new Map(), chamadas = []) {
  return {
    now: "2026-07-08T12:00:00.000Z",
    lerJsonEmSubpastaDrive: async (pastaDriveId, nomePasta, nomeArquivo) => {
      chamadas.push(["ler", pastaDriveId, nomePasta, nomeArquivo])
      return {
        pasta: { id: "admin-folder" },
        arquivo: arquivos.has(nomeArquivo) ? { id: `${nomeArquivo}-id` } : null,
        dados: arquivos.get(nomeArquivo) || null
      }
    },
    salvarJsonEmSubpastaDrive: async (pastaDriveId, nomePasta, nomeArquivo, dados) => {
      chamadas.push(["salvar", pastaDriveId, nomePasta, nomeArquivo])
      arquivos.set(nomeArquivo, JSON.parse(JSON.stringify(dados)))
      return { id: `${nomeArquivo}-id`, name: nomeArquivo, folderId: "admin-folder" }
    }
  }
}

async function main() {
  const arquivos = new Map()
  const chamadas = []
  const deps = criarDeps(arquivos, chamadas)

  assert.equal(await carregarEstadoDocumental("pasta-caso", deps), null)
  assert.equal(await estadoExiste("pasta-caso", deps), false)

  const criado = await salvarEstadoDocumental("pasta-caso", {
    analysis: { analises: [{ id: "a1" }] },
    registry: { documentos: [{ id: "d1" }] },
    checklist: { percentualCompleto: 40 },
    divergences: { divergencias: [] },
    dossier: { versao: "legal-dossier-v1" },
    pdfs: [{ arquivo: "docs.pdf" }]
  }, deps)

  assert.equal(criado.arquivo.name, DOCUMENT_STATE_FILE)
  assert.equal(criado.estado.version, DOCUMENT_STATE_VERSION)
  assert.equal(criado.estado.updatedAt, "2026-07-08T12:00:00.000Z")
  assert.equal(arquivos.get(DOCUMENT_STATE_FILE).analysis.analises.length, 1)
  assert.deepEqual(chamadas.at(-1), ["salvar", "pasta-caso", DOCUMENT_STATE_FOLDER, DOCUMENT_STATE_FILE])
  assert.equal(await estadoExiste("pasta-caso", deps), true)

  const lido = await carregarEstadoDocumental("pasta-caso", deps)
  assert.deepEqual(lido.registry.documentos, [{ id: "d1" }])
  assert.deepEqual(lido.registry.evidencias, [])
  assert.deepEqual(lido.registry.confirmacoes, [])
  assert.deepEqual(lido.registry.decisoes, [])
  assert.deepEqual(lido.pdfs, [{ arquivo: "docs.pdf" }])

  const atualizado = await atualizarEstadoDocumental("pasta-caso", {
    analysis: { analises: [{ id: "a1" }, { id: "a2" }] }
  }, deps)
  assert.equal(atualizado.estado.analysis.analises.length, 2)
  assert.deepEqual(atualizado.estado.registry.documentos, [{ id: "d1" }])
  assert.deepEqual(atualizado.estado.registry.evidencias, [])
  assert.deepEqual(atualizado.estado.pdfs, [{ arquivo: "docs.pdf" }])

  const snapshot = JSON.stringify(arquivos.get(DOCUMENT_STATE_FILE))
  await atualizarEstadoDocumental("pasta-caso", {
    analysis: { analises: [{ id: "a1" }, { id: "a2" }] }
  }, deps)
  assert.equal(JSON.stringify(arquivos.get(DOCUMENT_STATE_FILE)), snapshot)

  arquivos.set(DOCUMENT_STATE_FILE, "json corrompido")
  assert.equal(await carregarEstadoDocumental("pasta-caso", deps), null)
  assert.equal(await estadoExiste("pasta-caso", deps), false)
  const recuperado = await atualizarEstadoDocumental("pasta-caso", {
    checklist: { percentualCompleto: 100 }
  }, deps)
  assert.deepEqual(recuperado.estado.checklist, { percentualCompleto: 100 })
  assert.deepEqual(recuperado.estado.analysis, {})

  arquivos.set(DOCUMENT_STATE_FILE, { version: 999, analysis: { legado: true } })
  assert.equal(await carregarEstadoDocumental("pasta-caso", deps), null)
  const versaoCorrigida = await salvarEstadoDocumental("pasta-caso", arquivos.get(DOCUMENT_STATE_FILE), deps)
  assert.equal(versaoCorrigida.estado.version, DOCUMENT_STATE_VERSION)
  assert.deepEqual(versaoCorrigida.estado.analysis, { legado: true })

  console.log("document-state-repository.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
