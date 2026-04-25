import { fmt, decision } from '../lib/api.js'

export default function BinList({ bins, selectedId, onSelect }) {
  const sorted = [...bins].sort((a, b) => {
    const priorityDiff = decision.priority(b) - decision.priority(a)
    if (priorityDiff !== 0) return priorityDiff
    return (decision.timeToFull(a) ?? Infinity) - (decision.timeToFull(b) ?? Infinity)
  })

  return (
    <div style={{
      flex: '0 0 255px',
      borderBottom: '1px solid var(--border)',
      maxHeight: 255,
      overflowY: 'auto',
      background: 'var(--bg-panel)'
    }}>
      <div style={{ padding: '9px 18px 6px', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline' }}>
        <div>
          <div className="kicker">Priority List</div>
          <div style={{ marginTop: 2, fontSize: 10, color: 'var(--ink-mute)' }}>
            Simulated bins are used to demonstrate multi-location operations.
          </div>
        </div>
        <div className="kicker">{bins.length} Bins</div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.35fr 0.5fr 0.85fr 1.15fr 0.95fr',
        gap: 9,
        padding: '7px 18px',
        borderTop: '1px solid var(--border-soft)',
        background: 'var(--bg-soft)',
        color: 'var(--ink-mute)'
      }}>
        <Head>Location</Head>
        <Head>Fill</Head>
        <Head>Status</Head>
        <Head>Action</Head>
        <Head title="Predicted time until bin reaches collection level">Time to full</Head>
      </div>

      {sorted.map(bin => {
        const active = bin.sensor_id === selectedId
        return (
          <button
            key={bin.sensor_id}
            onClick={() => onSelect(bin.sensor_id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.35fr 0.5fr 0.85fr 1.15fr 0.95fr',
              gap: 9,
              alignItems: 'center',
              width: '100%',
              padding: '8px 18px',
              background: active ? 'var(--accent-2-soft)' : rowBackground(bin),
              borderTop: `1px solid ${decision.priority(bin) >= 4 ? 'rgba(185, 28, 28, 0.22)' : 'var(--border-soft)'}`,
              borderLeft: active ? '4px solid var(--accent-2)' : decision.priority(bin) >= 4 ? '4px solid var(--red)' : '4px solid transparent',
              textAlign: 'left',
              transition: 'background 120ms'
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'rgba(204, 251, 241, 0.32)'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = rowBackground(bin)
            }}
          >
            <Cell strong>
              {bin.location}
              <SourceBadge live={!bin.is_simulated} />
            </Cell>
            <Cell>{fmt.fill(bin.fillLevel)}</Cell>
            <Cell>
              <span style={{ color: statusColor(decision.status(bin)), fontWeight: 700 }}>
                {decision.status(bin)}
              </span>
            </Cell>
            <Cell>{decision.action(bin)}</Cell>
            <Cell>{decision.timeToFull(bin) == null ? '—' : fmt.duration(decision.timeToFull(bin))}</Cell>
          </button>
        )
      })}

      {sorted.length === 0 && (
        <div style={{ padding: 24, color: 'var(--ink-mute)', textAlign: 'center', fontSize: 12 }}>
          <span className="skeleton" style={{ width: 200, height: 14 }} />
        </div>
      )}
    </div>
  )
}

function Head({ children, title }) {
  return (
    <div className="font-mono" title={title} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {children}
      {title && <span style={{ marginLeft: 5, color: 'var(--ink-faint)' }}>?</span>}
    </div>
  )
}

function Cell({ children, strong }) {
  return (
    <div style={{
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: strong ? 14 : 13.5,
      fontWeight: strong ? 700 : 500,
      color: strong ? 'var(--ink)' : 'var(--ink-soft)',
      lineHeight: 1.25
    }}>
      {children}
    </div>
  )
}

function SourceBadge({ live }) {
  return (
    <span className={live ? 'source-badge live' : 'source-badge sim'}>
      {live ? 'LIVE DEVICE' : 'SIM'}
    </span>
  )
}

function rowBackground(bin) {
  if (decision.priority(bin) >= 4) return 'rgba(185, 28, 28, 0.045)'
  if (decision.priority(bin) === 3) return 'rgba(180, 83, 9, 0.045)'
  return 'transparent'
}

function statusColor(status) {
  return {
    Full: 'var(--state-full)',
    'Almost Full': 'var(--state-almost)',
    'Light Waste': 'var(--state-light)',
    Normal: 'var(--state-normal)',
    Empty: 'var(--state-empty)',
    Anomaly: 'var(--state-anomaly)'
  }[status] || 'var(--ink-soft)'
}
