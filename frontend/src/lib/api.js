/**
 * Backend API client.
 * All data on the dashboard flows through these calls — no hardcoded data anywhere.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5050').replace(/\/$/, '')

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`
  const { timeoutMs, ...fetchOptions } = options
  const controller = timeoutMs ? new AbortController() : null
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null
  let res
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller?.signal,
      ...fetchOptions
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`)
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error')
    throw new Error(`${res.status} ${res.statusText}: ${errorText}`)
  }
  return res.json()
}

export const api = {
  serviceInfo:   ()                  => request('/'),
  fleetSummary:  ()                  => request('/api/fleet/summary'),
  binCurrent:    (binId)             => request(`/api/bin/${binId}/current`),
  binHistory:    (binId, hours = 24) => request(`/api/bin/${binId}/history?hours=${hours}`),
  binAnalytics:  (binId)             => request(`/api/bin/${binId}/analytics`),
  analyticsBins: ()                  => request('/api/analytics/summary', { timeoutMs: 5000 }),
  analyticsSummary: (binId)          => request(`/api/analytics/summary?sensor_id=${encodeURIComponent(binId)}`, { timeoutMs: 5000 }),
  analyticsTimeseries: (binId, hours = 24) =>
                                      request(`/api/analytics/timeseries?sensor_id=${encodeURIComponent(binId)}&hours=${hours}`, { timeoutMs: 5000 }),
  analyticsBin:  (binId)             => request(`/api/analytics/bin/${binId}`),
  predict:       (reading)           => request('/api/predict',     { method: 'POST', body: JSON.stringify(reading) }),
  dispatchSms:   (binId, message)    => request('/api/dispatch-sms', {
                                          method: 'POST',
                                          body: JSON.stringify({ bin_id: binId, message })
                                        }),
  dispatchLog:   ()                  => request('/api/dispatch-log'),
  chat: (payload) => request('/api/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 20000
  })
}

/** Format helpers — local presentation only, no data fabrication. */
export const fmt = {
  weight: (g) => {
    if (g == null) return '—'
    if (g < 1000) return `${Math.round(g)} g`
    return `${(g / 1000).toFixed(2)} kg`
  },
  fill: (pct) => pct == null ? '—' : `${pct}%`,
  duration: (minutes) => {
    if (minutes == null || minutes <= 0) return '—'
    if (minutes < 60) return `${Math.round(minutes)} min`
    const h = Math.floor(minutes / 60)
    const m = Math.round(minutes % 60)
    return m === 0 ? `${h} hr` : `${h}h ${m}m`
  },
  time: (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } catch { return '—' }
  },
  datetime: (iso) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return '—' }
  }
}

export const decision = {
  status: (reading) => reading?.status || 'Normal',
  action: (reading) => reading?.action || 'Monitor',
  timeToFull: (reading) => reading?.time_to_full,
  priority: (reading) => Number(reading?.priority ?? 0)
}

/** Build a recommended SMS body from current reading + bin meta. */
export function composeSms(reading) {
  const name = reading.location || reading.sensor_id
  const minutes = decision.timeToFull(reading)
  const action = decision.action(reading)

  switch (action) {
    case 'Collect immediately':
      return `${name} requires immediate collection. Fill level is ${reading.fillLevel}%.`
    case 'Delay collection / compress waste':
      return `${name} contains light waste. Delay collection and compress waste before the next trip. Fill level is ${reading.fillLevel}%.`
    case 'Inspect bin / sensor':
      return `${name} needs inspection. Current reading: ${reading.fillLevel}% fill / ${fmt.weight(reading.weight)}.`
    case 'Collect within 1 hour':
      return `${name} should be collected within 1 hour. Fill level is ${reading.fillLevel}%; expected full in ${fmt.duration(minutes)}.`
    default:
      return `${name}: ${action}. Fill level is ${reading.fillLevel}%.`
  }
}
