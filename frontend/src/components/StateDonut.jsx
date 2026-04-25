/**
 * Status distribution donut — shows % time spent in each operational status.
 * Pure SVG, no library.
 */

const STATE_COLOR = {
  Anomaly: '#6D28D9',
  Full: '#B91C1C',
  'Almost Full': '#C2410C',
  'Light Waste': '#14B8A6',
  Normal: '#15803D',
  Empty: '#94908A'
}

export default function StateDonut({ distribution }) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [_, v]) => s + v, 0)

  if (total === 0) {
    return (
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        padding: 24,
        textAlign: 'center',
        color: 'var(--ink-mute)',
        fontSize: 12
      }}>
        No status data available.
      </div>
    )
  }

  // Donut geometry
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const r  = 72
  const strokeWidth = 18

  // Build arc segments
  let cumulative = 0
  const circumference = 2 * Math.PI * r

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      padding: 20,
      display: 'flex',
      gap: 24,
      alignItems: 'center'
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="var(--bg-soft)"
          strokeWidth={strokeWidth}
        />
        {entries.map(([state, count]) => {
          const fraction = count / total
          const dashLength = fraction * circumference
          const gap = circumference - dashLength
          const offset = -cumulative * circumference + circumference * 0.25  // start from top
          cumulative += fraction

          return (
            <circle
              key={state}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={STATE_COLOR[state] || '#94908A'}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${gap}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>{state} — {count} ({(fraction * 100).toFixed(1)}%)</title>
            </circle>
          )
        })}

        {/* Center label */}
        <text x={cx} y={cy - 4} textAnchor="middle"
              fontFamily="Fraunces" fontSize="22" fontWeight="400"
              fill="var(--ink)">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle"
              fontFamily="Geist Mono" fontSize="9" letterSpacing="0.1em"
              fill="var(--ink-mute)">
          READINGS
        </text>
      </svg>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([state, count]) => {
          const pct = (count / total * 100).toFixed(1)
          return (
            <div key={state} style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 10,
              alignItems: 'center',
              fontSize: 12.5
            }}>
              <span style={{
                width: 10, height: 10,
                background: STATE_COLOR[state] || '#94908A',
                borderRadius: 1
              }} />
              <span>{state}</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-mute)',
                fontFeatureSettings: '"tnum"'
              }}>
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
