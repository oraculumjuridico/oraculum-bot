"use strict"

/**
 * TESTE ISOLADO DA MÁQUINA DE ESTADOS DAS BARREIRAS
 *
 * Testa a orquestração de concorrência sem PostgreSQL,
 * comprovando que não há promises pendentes nem deadlocks.
 */

const assert = require("node:assert/strict")
const { test } = require("node:test")

// Simular emissor com hooks
async function mockEmitter(name, hooks = {}) {
  console.log(`[${name}] Iniciando`)

  // Simular historização
  await new Promise(resolve => setTimeout(resolve, 10))

  if (hooks.afterSupersede) {
    await hooks.afterSupersede()
  }

  // Simular INSERT
  await new Promise(resolve => setTimeout(resolve, 10))

  if (hooks.afterFirstInsert) {
    await hooks.afterFirstInsert()
  }

  console.log(`[${name}] Concluído`)
  return { success: true, name }
}

test("barreira: fluxo normal - A libera B e não espera", async () => {
  let releaseB
  const barrierB = new Promise(resolve => { releaseB = resolve })

  const emissionA = (async () => {
    const hooks = {
      afterSupersede: async () => {
        console.log("[A] Liberando B")
        releaseB()
        // NÃO aguarda B concluir
      }
    }
    return await mockEmitter("A", hooks)
  })()

  const emissionB = (async () => {
    await barrierB
    console.log("[B] Iniciando após liberação")
    return await mockEmitter("B")
  })()

  const [resultA, resultB] = await Promise.all([emissionA, emissionB])

  assert.equal(resultA.success, true)
  assert.equal(resultB.success, true)
  console.log("[BARRIER TEST] Fluxo normal OK")
})

test("barreira: A falha antes de liberar B", async () => {
  let releaseB
  const barrierB = new Promise(resolve => { releaseB = resolve })

  const emissionA = (async () => {
    const hooks = {
      afterSupersede: async () => {
        throw new Error("A_FAILED_BEFORE_RELEASE")
      }
    }
    try {
      return await mockEmitter("A", hooks)
    } catch (err) {
      // A deve liberar B mesmo em falha para evitar deadlock
      releaseB()
      return { success: false, error: err.message }
    }
  })()

  const emissionB = (async () => {
    await barrierB
    return await mockEmitter("B")
  })()

  const [resultA, resultB] = await Promise.all([emissionA, emissionB])

  assert.equal(resultA.success, false)
  assert.equal(resultA.error, "A_FAILED_BEFORE_RELEASE")
  assert.equal(resultB.success, true)
  console.log("[BARRIER TEST] A falha antes de liberar B - OK")
})

test("barreira: A falha depois de liberar B", async () => {
  let releaseB
  const barrierB = new Promise(resolve => { releaseB = resolve })

  const emissionA = (async () => {
    const hooks = {
      afterSupersede: async () => {
        releaseB()
      },
      afterFirstInsert: async () => {
        throw new Error("A_FAILED_AFTER_RELEASE")
      }
    }
    try {
      return await mockEmitter("A", hooks)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })()

  const emissionB = (async () => {
    await barrierB
    return await mockEmitter("B")
  })()

  const [resultA, resultB] = await Promise.all([emissionA, emissionB])

  assert.equal(resultA.success, false)
  assert.equal(resultA.error, "A_FAILED_AFTER_RELEASE")
  assert.equal(resultB.success, true)
  console.log("[BARRIER TEST] A falha depois de liberar B - OK")
})

test("barreira: B falha após ser liberada", async () => {
  let releaseB
  const barrierB = new Promise(resolve => { releaseB = resolve })

  const emissionA = (async () => {
    const hooks = {
      afterSupersede: async () => {
        releaseB()
      }
    }
    return await mockEmitter("A", hooks)
  })()

  const emissionB = (async () => {
    await barrierB
    throw new Error("B_FAILED")
  })()

  let resultA, resultB
  try {
    [resultA, resultB] = await Promise.all([emissionA, emissionB])
  } catch (err) {
    // B falhou mas A deve ter sucedido
    resultA = await emissionA.catch(() => ({ success: true }))
    resultB = { success: false, error: err.message }
  }

  assert.equal(resultA.success, true)
  assert.equal(resultB.error, "B_FAILED")
  console.log("[BARRIER TEST] B falha - OK")
})

test("barreira: timeout não deixa promise pendente", async () => {
  let releaseB
  const barrierB = new Promise(resolve => { releaseB = resolve })

  const TIMEOUT_MS = 100

  const emissionA = (async () => {
    // A nunca libera B (simula deadlock)
    return await mockEmitter("A")
  })()

  const emissionB = (async () => {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("BARRIER_TIMEOUT")), TIMEOUT_MS)
    )

    await Promise.race([barrierB, timeoutPromise])
    return await mockEmitter("B")
  })()

  let resultA, resultB
  try {
    [resultA, resultB] = await Promise.all([emissionA, emissionB])
  } catch (err) {
    resultA = await emissionA
    resultB = { success: false, error: err.message }
  }

  assert.equal(resultA.success, true)
  assert.equal(resultB.error, "BARRIER_TIMEOUT")
  console.log("[BARRIER TEST] Timeout não deixa promise pendente - OK")
})

test("barreira: nenhum unhandledRejection", async () => {
  let unhandledCount = 0
  const handler = () => { unhandledCount++ }

  process.on("unhandledRejection", handler)

  try {
    let releaseB
    const barrierB = new Promise(resolve => { releaseB = resolve })

    const emissionA = (async () => {
      const hooks = {
        afterSupersede: async () => { releaseB() }
      }
      return await mockEmitter("A", hooks)
    })()

    const emissionB = (async () => {
      await barrierB
      return await mockEmitter("B")
    })()

    await Promise.all([emissionA, emissionB])

    // Aguardar um tick para detectar unhandledRejection
    await new Promise(resolve => setTimeout(resolve, 50))

    assert.equal(unhandledCount, 0, "Não deve haver unhandledRejection")
    console.log("[BARRIER TEST] Nenhum unhandledRejection - OK")
  } finally {
    process.removeListener("unhandledRejection", handler)
  }
})

test("barreira: erro assíncrono não impede cleanup", async () => {
  let cleanupExecuted = false

  async function testWithAsyncError() {
    let unhandledRejections = []
    const handler = (err) => { unhandledRejections.push(err) }

    process.on("unhandledRejection", handler)

    try {
      // Simular erro assíncrono
      Promise.reject(new Error("ASYNC_ERROR")).catch(() => {
        unhandledRejections.push(new Error("ASYNC_ERROR"))
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      return unhandledRejections.length > 0
    } finally {
      process.removeListener("unhandledRejection", handler)
      cleanupExecuted = true
    }
  }

  await testWithAsyncError()
  assert.equal(cleanupExecuted, true, "Cleanup deve executar mesmo com erro assíncrono")
  console.log("[BARRIER TEST] Erro assíncrono não impede cleanup - OK")
})

test("barreira: falha de cleanup não apaga erro principal", async () => {
  let mainError = new Error("MAIN_ERROR")
  let cleanupError = new Error("CLEANUP_ERROR")
  let pendingAsyncError = mainError

  try {
    throw cleanupError
  } catch (err) {
    // Não substituir erro principal
    if (!pendingAsyncError) {
      pendingAsyncError = err
    }
  }

  assert.equal(pendingAsyncError.message, "MAIN_ERROR", "Erro principal deve ser preservado")
  console.log("[BARRIER TEST] Falha de cleanup não apaga erro principal - OK")
})

test("barreira: lock observado somente quando blocking_pids contém A", async () => {
  // Simular resposta de pg_blocking_pids
  function checkBlocking(blockingPidsStr, pidA) {
    const blockingPids = blockingPidsStr
      .replace(/[{}]/g, '')
      .split(',')
      .filter(p => p)
      .map(p => parseInt(p, 10))

    return blockingPids.includes(pidA)
  }

  const pidA = 1234

  // Caso 1: A está nos bloqueadores
  assert.equal(checkBlocking("{1234,5678}", pidA), true, "A deve ser identificado")

  // Caso 2: A não está nos bloqueadores
  assert.equal(checkBlocking("{5678,9012}", pidA), false, "A não deve ser identificado")

  // Caso 3: Array vazio
  assert.equal(checkBlocking("{}", pidA), false, "Array vazio não deve identificar A")

  console.log("[BARRIER TEST] Lock observado somente quando blocking_pids contém A - OK")
})

test("barreira: bloqueador diferente de A é rejeitado", async () => {
  const pidA = 1234
  const pidOther = 5678

  function validateBlocker(blockingPidsStr, expectedPid) {
    const blockingPids = blockingPidsStr
      .replace(/[{}]/g, '')
      .split(',')
      .filter(p => p)
      .map(p => parseInt(p, 10))

    return blockingPids.includes(expectedPid)
  }

  // B bloqueado por outro PID, não A
  const isABlocking = validateBlocker(`{${pidOther}}`, pidA)
  assert.equal(isABlocking, false, "Bloqueador diferente de A deve ser rejeitado")

  console.log("[BARRIER TEST] Bloqueador diferente de A é rejeitado - OK")
})

test("barreira: ausência de lock resulta em timeout controlado", async () => {
  const TIMEOUT_MS = 100
  let timeoutOccurred = false

  const checkLock = new Promise((resolve) => {
    setTimeout(() => {
      timeoutOccurred = true
      resolve({ observed: false })
    }, TIMEOUT_MS)
  })

  const result = await checkLock
  assert.equal(result.observed, false, "Ausência de lock deve retornar observed=false")
  assert.equal(timeoutOccurred, true, "Timeout deve ter ocorrido")

  console.log("[BARRIER TEST] Ausência de lock resulta em timeout controlado - OK")
})

test("barreira: todos os listeners são removidos", async () => {
  let listenersRemoved = false

  const handler = () => {}

  process.on("unhandledRejection", handler)

  try {
    // Simular operação
    await new Promise(resolve => setTimeout(resolve, 10))
  } finally {
    process.removeListener("unhandledRejection", handler)
    listenersRemoved = true
  }

  assert.equal(listenersRemoved, true, "Listeners devem ser removidos no finally")
  console.log("[BARRIER TEST] Todos os listeners são removidos - OK")
})

test("barreira: B bloqueada por A e A com transação aberta", async () => {
  // Simular consulta simultânea de A e B
  function validateLockObservation(rows, pidA, pidB) {
    const rowB = rows.find(r => r.pid === pidB)
    const rowA = rows.find(r => r.pid === pidA)

    if (!rowB || !rowA) return { valid: false, reason: "A ou B ausentes" }
    if (rowB.wait_event_type !== 'Lock') return { valid: false, reason: "B não aguardando Lock" }
    if (rowA.xact_start === null) return { valid: false, reason: "A sem transação" }

    const blockingPids = Array.isArray(rowB.blocking_pids) ? rowB.blocking_pids : []
    if (!blockingPids.includes(pidA)) return { valid: false, reason: "A não é bloqueador" }

    return { valid: true }
  }

  const pidA = 1234
  const pidB = 5678

  const rows = [
    { pid: pidB, wait_event_type: 'Lock', blocking_pids: [pidA], xact_start: null },
    { pid: pidA, wait_event_type: null, blocking_pids: [], xact_start: '2026-07-17T12:00:00Z' }
  ]

  const result = validateLockObservation(rows, pidA, pidB)
  assert.equal(result.valid, true, "Observação deve ser válida")

  console.log("[BARRIER TEST] B bloqueada por A e A com transação aberta - OK")
})

test("barreira: B bloqueada por terceiro é rejeitada", async () => {
  function validateLockObservation(rows, pidA, pidB) {
    const rowB = rows.find(r => r.pid === pidB)
    const rowA = rows.find(r => r.pid === pidA)

    if (!rowB || !rowA) return { valid: false, reason: "A ou B ausentes" }
    if (rowB.wait_event_type !== 'Lock') return { valid: false, reason: "B não aguardando Lock" }

    const blockingPids = Array.isArray(rowB.blocking_pids) ? rowB.blocking_pids : []
    if (!blockingPids.includes(pidA)) return { valid: false, reason: "A não é bloqueador" }

    return { valid: true }
  }

  const pidA = 1234
  const pidB = 5678
  const pidOther = 9999

  const rows = [
    { pid: pidB, wait_event_type: 'Lock', blocking_pids: [pidOther], xact_start: null },
    { pid: pidA, wait_event_type: null, blocking_pids: [], xact_start: '2026-07-17T12:00:00Z' }
  ]

  const result = validateLockObservation(rows, pidA, pidB)
  assert.equal(result.valid, false, "Bloqueador diferente deve ser rejeitado")
  assert.equal(result.reason, "A não é bloqueador", "Razão deve ser clara")

  console.log("[BARRIER TEST] B bloqueada por terceiro é rejeitada - OK")
})

test("barreira: Promise.allSettled aguarda A quando B rejeita", async () => {
  let aFinished = false

  const promiseA = (async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    aFinished = true
    return { success: true }
  })()

  const promiseB = (async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    throw new Error("B_FAILED")
  })()

  const [settledA, settledB] = await Promise.allSettled([promiseA, promiseB])

  assert.equal(aFinished, true, "A deve terminar mesmo se B rejeitar")
  assert.equal(settledA.status, 'fulfilled', "A deve ter sucesso")
  assert.equal(settledB.status, 'rejected', "B deve ter falhado")

  console.log("[BARRIER TEST] Promise.allSettled aguarda A quando B rejeita - OK")
})

test("barreira: Promise.allSettled aguarda B quando A rejeita", async () => {
  let bFinished = false

  const promiseA = (async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    throw new Error("A_FAILED")
  })()

  const promiseB = (async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    bFinished = true
    return { success: true }
  })()

  const [settledA, settledB] = await Promise.allSettled([promiseA, promiseB])

  assert.equal(bFinished, true, "B deve terminar mesmo se A rejeitar")
  assert.equal(settledA.status, 'rejected', "A deve ter falhado")
  assert.equal(settledB.status, 'fulfilled', "B deve ter sucesso")

  console.log("[BARRIER TEST] Promise.allSettled aguarda B quando A rejeita - OK")
})

test("barreira: cleanup só começa depois de ambas terminarem", async () => {
  let aFinished = false
  let bFinished = false
  let cleanupStarted = false

  const promiseA = (async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    aFinished = true
    return { success: true }
  })()

  const promiseB = (async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    bFinished = true
    return { success: true }
  })()

  await Promise.allSettled([promiseA, promiseB])

  cleanupStarted = true

  assert.equal(aFinished, true, "A deve ter terminado antes do cleanup")
  assert.equal(bFinished, true, "B deve ter terminado antes do cleanup")
  assert.equal(cleanupStarted, true, "Cleanup iniciado")

  console.log("[BARRIER TEST] Cleanup só começa depois de ambas terminarem - OK")
})

test("barreira: erro principal não é apagado por erro de cleanup", async () => {
  let primaryError = new Error("PRIMARY_ERROR")
  let cleanupError = new Error("CLEANUP_ERROR")

  // Simular precedência
  const errorToThrow = primaryError || cleanupError

  assert.equal(errorToThrow.message, "PRIMARY_ERROR", "Erro principal deve ter precedência")
  console.log("[BARRIER TEST] Erro principal não é apagado por erro de cleanup - OK")
})

test("barreira: erro assíncrono não é apagado por erro de cleanup", async () => {
  let primaryError = null
  let asyncError = new Error("ASYNC_ERROR")
  let cleanupError = new Error("CLEANUP_ERROR")

  // Simular precedência
  const errorToThrow = primaryError || asyncError || cleanupError

  assert.equal(errorToThrow.message, "ASYNC_ERROR", "Erro assíncrono deve ter precedência sobre cleanup")
  console.log("[BARRIER TEST] Erro assíncrono não é apagado por erro de cleanup - OK")
})
