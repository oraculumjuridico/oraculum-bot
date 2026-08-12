"use strict"

function validDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
function reminderToday(inicio, hour = 9) {
  const date = validDate(inicio)
  if (!date) return null
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return new Date(`${map.year}-${map.month}-${map.day}T${String(hour).padStart(2, "0")}:00:00-03:00`)
}
function consultationScope(data, { todayHour = 9, now = new Date(), maxReminderDelayMs = 30 * 60 * 1000 } = {}) {
  const start = validDate(data?.datetime)
  const current = validDate(now)
  if (!start || !data?.eventId || !data?.phone) return null
  const reminders = [
    ["24h", validDate(data.reminders?.["24h"]) || new Date(start.getTime() - 86400000)],
    ["hoje", reminderToday(start, todayHour)],
    ["1h", validDate(data.reminders?.["1h"]) || new Date(start.getTime() - 3600000)]
  ].filter(([, scheduled]) =>
    scheduled &&
    scheduled < start &&
    (!current || scheduled.getTime() >= current.getTime() - maxReminderDelayMs)
  )
  const base = {
    phone: data.phone, name: data.name, eventId: data.eventId,
    dealId: data.dealId || null, casoId: data.casoId || null, datetime: start.toISOString()
  }
  const jobs = reminders.map(([tipo, scheduled]) => ({
    kind: "consultation_reminder",
    dedupeKey: `consultation:${data.eventId}:reminder:${tipo}:${scheduled.toISOString()}`,
    scopeType: "consultation", scopeId: data.eventId,
    scheduledFor: scheduled.toISOString(),
    payload: { ...base, tipo, scheduledFor: scheduled.toISOString() }
  }))
  jobs.push({
    kind: "consultation_sync",
    dedupeKey: `consultation:${data.eventId}:sync:${start.toISOString()}`,
    scopeType: "consultation", scopeId: data.eventId,
    scheduledFor: current.toISOString(),
    payload: { ...base, end: data.end || null }
  })
  jobs.push({
    kind: "consultation_lifecycle",
    dedupeKey: `consultation:${data.eventId}:lifecycle:${start.toISOString()}`,
    scopeType: "consultation", scopeId: data.eventId,
    scheduledFor: data.end || start.toISOString(),
    payload: { eventId: data.eventId, dealId: data.dealId || null, force: true }
  })
  return { scopeType: "consultation", scopeId: data.eventId, jobs }
}
function reengagementScope(data) {
  if (!data?.phone) return null
  const jobs = (data.jobs || []).filter(job => validDate(job.scheduledFor)).map(job => ({
    kind: "reengagement",
    dedupeKey: `reengagement:${data.phone}:${job.tipoEvento}:${job.scheduledFor}`,
    scopeType: "reengagement", scopeId: data.phone,
    scheduledFor: job.scheduledFor,
    payload: {
      phone: data.phone, dealId: data.dealId || null, jobId: job.id,
      tipoEvento: job.tipoEvento, scheduledFor: job.scheduledFor
    }
  }))
  return { scopeType: "reengagement", scopeId: data.phone, jobs }
}

function consultationLifecycleScope(data) {
  if (!data?.eventId || !["cancel", "complete"].includes(data.action)) return null
  const scheduled = validDate(data.scheduledFor) || new Date()
  return {
    scopeType: "consultation",
    scopeId: data.eventId,
    jobs: [{
      kind: "consultation_lifecycle",
      dedupeKey: `consultation:${data.eventId}:lifecycle:${data.action}`,
      scopeType: "consultation",
      scopeId: data.eventId,
      scheduledFor: scheduled.toISOString(),
      payload: {
        action: data.action,
        eventId: data.eventId,
        dealId: data.dealId || null,
        force: data.action === "complete"
      }
    }]
  }
}

module.exports = { reminderToday, consultationScope, consultationLifecycleScope, reengagementScope }
