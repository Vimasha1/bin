/**
 * Custom SVG line chart — fill level over time.
 * No chart library: we control every pixel.
 */
import { useMemo } from 'react'

export default function FillTrendChart({ readings }) {
  const data = useMemo(() => {
    if (!readings.length) return null

    // Sort by time
    const sorted = [...readings].sort(
      (a, b) => new Date(a.timestamp || a.last_updated) - new Date(b.timestamp || b.last_updated)
    )

    const xs = sorted.map(r => new Date(r.timestamp || r.last_updated).getTime())
    const ys = sorted.map(r => r.fillLevel)

    return {
      sorted,
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: 0,
      yMax: 100
    }
  }, [readings])

  if (!data) {
    return (
      <div style={{
        height: 280,
        background: 'var(--bg-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-mute)',
        fontSize: 12
      }}>
        Loading time series…
      </div>
    )
  }

  // Chart dimensions
  const W = 1000
  const H = 280
  const PAD_L = 40
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 32

  const xScale = (t) => PAD_L + ((t - data.xMin) / (data.xMax - data.xMin || 1)) * (W - PAD_L - PAD_R)
  const yScale = (v) => PAD_T + (1 - (v - data.yMin) / (data.yMax - data.yMin)) * (H - PAD_T - PAD_B)

  // Build path
  const path = data.sorted.map((r, i) => {
    const x = xScale(new Date(r.timestamp || r.last_updated).getTime())
    const y = yScale(r.fillLevel)
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  // Y axis ticks
  const yTicks = [0, 25, 50, 75, 100]

  // X axis ticks (every 4 hours)
  const xTicks = []
  const start = new Date(data.xMin)
  start.setMinutes(0, 0, 0)
  for (let t = start.getTime(); t <= data.xMax; t += 4 * 3600 * 1000) {
    xTicks.push(t)
  }

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '12px 0' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 280, display: 'block' }}>
        {/* Y gridlines */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yScale(v)} y2={yScale(v)}
                  stroke="var(--border-soft)" strokeWidth="1" />
            <text x={PAD_L - 8} y={yScale(v)} dominantBaseline="middle" textAnchor="end"
                  fontFamily="Geist Mono" fontSize="10" fill="var(--ink-mute)">
              {v}
            </text>
          </g>
        ))}

        {/* X tick labels */}
        {xTicks.map(t => (
          <text key={t}
                x={xScale(t)} y={H - 10}
                textAnchor="middle"
                fontFamily="Geist Mono"
                fontSize="9.5"
                fill="var(--ink-mute)"
                letterSpacing="0.05em">
            {new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </text>
        ))}

        {/* The line */}
        <path d={path} stroke="var(--accent)" strokeWidth="1.5" fill="none" />

        {/* Y axis */}
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="var(--ink)" strokeWidth="0.5" />
        {/* Y label */}
        <text x={PAD_L - 24} y={PAD_T - 4} fontFamily="Geist Mono" fontSize="9.5"
              fill="var(--ink-mute)" letterSpacing="0.1em">FILL %</text>
      </svg>
      <div style={{ padding: '8px 16px 4px', display: 'flex', gap: 20, fontSize: 10.5, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 1.5, background: 'var(--accent)' }} /> FILL LEVEL
        </span>
      </div>
    </div>
  )
}
