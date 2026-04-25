/**
 * Hourly heatmap — vertical bars showing average fill level per hour.
 * Peak hour is highlighted with the accent color.
 */

export default function HourlyHeatmap({ hourlyAvgFill, peakHour }) {
  // Build 24 entries (0-23), filling missing hours with 0
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    avg: hourlyAvgFill[h] ?? hourlyAvgFill[String(h)] ?? 0
  }))

  const maxVal = Math.max(...hours.map(h => h.avg), 1)

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      padding: '20px 16px 12px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 2,
        height: 180,
        paddingBottom: 8,
        borderBottom: '1px solid var(--border)'
      }}>
        {hours.map(h => {
          const heightPct = maxVal > 0 ? (h.avg / maxVal) * 100 : 0
          const isPeak = h.hour === peakHour
          return (
            <div
              key={h.hour}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                position: 'relative'
              }}
              title={`${h.hour}:00 — avg fill ${h.avg.toFixed(1)}%`}
            >
              <div style={{
                height: `${heightPct}%`,
                background: isPeak ? 'var(--accent)' : 'var(--ink-soft)',
                opacity: isPeak ? 1 : 0.55,
                minHeight: h.avg > 0 ? 2 : 0,
                transition: 'background 200ms'
              }} />
            </div>
          )
        })}
      </div>

      {/* Hour labels — show every 3 hours for clarity */}
      <div style={{
        display: 'flex',
        gap: 2,
        marginTop: 8,
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        color: 'var(--ink-mute)',
        letterSpacing: '0.06em'
      }}>
        {hours.map(h => (
          <div key={h.hour} style={{
            flex: 1,
            textAlign: 'center',
            visibility: h.hour % 3 === 0 ? 'visible' : 'hidden'
          }}>
            {String(h.hour).padStart(2, '0')}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 20,
        marginTop: 10,
        fontSize: 10.5,
        color: 'var(--ink-mute)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.06em'
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: 'var(--accent)' }} /> PEAK HOUR
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: 'var(--ink-soft)', opacity: 0.55 }} /> AVG FILL %
        </span>
      </div>
    </div>
  )
}
