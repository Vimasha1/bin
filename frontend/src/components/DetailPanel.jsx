import { fmt, decision } from '../lib/api.js'

export default function DetailPanel({ bin, liveStatus, onDispatch, onAnalytics }) {
  if (!bin) {
    return (
      <div style={{ padding: 24, color: 'var(--ink-mute)' }}>
        <span className="skeleton" style={{ width: 220, height: 28 }} />
      </div>
    )
  }

  const status = decision.status(bin)
  const action = decision.action(bin)
  const timeToFull = decision.timeToFull(bin)
  const priority = decision.priority(bin)
  const requiresDispatch = priority >= 3 || action === 'Delay collection / compress waste'
  const isSimulated = bin.is_simulated || bin.data_source === 'historical_simulated'
  const isLive = !isSimulated
  const readingAge = getReadingAgeSeconds(bin.last_updated)
  const waitingForLatest = isLive && readingAge != null && readingAge > 30
  const liveMessage = isLive
    ? liveStatus || (waitingForLatest ? 'Waiting for latest reading...' : null)
    : null

  return (
    <div style={{
      padding: '14px 18px 16px',
      flex: '1 1 0',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-panel)',
      overflow: 'hidden'
    }}>
      <div>
        <div className="kicker">
          {isSimulated ? `SIM · dataset playback · ${bin.sensor_id}` : `LIVE DEVICE · ${bin.sensor_id}`}
        </div>
        <h2 className="font-serif" style={{
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          marginTop: 3,
          lineHeight: 1.02,
          color: 'var(--navy)'
        }}>
          {bin.location}
        </h2>
        {liveMessage && (
          <div style={{
            marginTop: 7,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 8px',
            background: 'var(--accent-2-soft)',
            color: 'var(--accent-2)',
            border: '1px solid rgba(20, 184, 166, 0.35)',
            borderRadius: 999,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.06em'
          }}>
            <span className="status-dot" />
            {liveMessage}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--border)',
        display: 'grid',
        gap: 7
      }}>
        <DecisionBlock label="Status" value={status} tone={statusTone(status)} />
        <DecisionBlock label="Action" value={action} large />
        {timeToFull != null && (
          <DecisionBlock label="Time to full" value={`Expected full in ${fmt.duration(timeToFull)}`} />
        )}
      </div>

      <div style={{
        marginTop: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--border)'
      }}>
        <Metric label="Fill" value={fmt.fill(bin.fillLevel)} />
        <Metric label="Weight" value={fmt.weight(bin.weight)} />
      </div>

      <div style={{
        marginTop: 'auto',
        paddingTop: 10,
        paddingBottom: 2,
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap'
      }}>
        <button
          className="btn"
          disabled={!requiresDispatch}
          onClick={onDispatch}
          title={requiresDispatch ? '' : 'No dispatch required for this bin'}
        >
          {buttonLabel(action)}
        </button>
        <button className="btn-ghost btn" onClick={onAnalytics}>
          View Analytics →
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>
        Last updated: {fmt.datetime(bin.last_updated)}
      </div>
    </div>
  )
}

function DecisionBlock({ label, value, tone, large }) {
  return (
    <div>
      <div className="kicker">{label}</div>
      <div
        className="font-serif"
        style={{
          marginTop: 4,
          fontSize: large ? 21 : 18,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          color: tone || 'var(--ink)'
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="kicker">{label}</div>
      <div className="font-serif" style={{ fontSize: 20, fontWeight: 800, marginTop: 3, lineHeight: 1, color: 'var(--navy)' }}>
        {value}
      </div>
    </div>
  )
}

function statusTone(status) {
  return {
    Full: 'var(--state-full)',
    'Almost Full': 'var(--state-almost)',
    'Light Waste': 'var(--state-light)',
    Normal: 'var(--state-normal)',
    Empty: 'var(--state-empty)',
    Anomaly: 'var(--state-anomaly)'
  }[status] || 'var(--ink)'
}

function buttonLabel(action) {
  if (action === 'Collect immediately') return 'Dispatch Collection'
  if (action === 'Collect within 1 hour') return 'Schedule Collection'
  if (action === 'Inspect bin / sensor') return 'Dispatch Inspection'
  if (action === 'Delay collection / compress waste') return 'Dispatch Compression'
  return 'No Action Needed'
}

function getReadingAgeSeconds(iso) {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, (Date.now() - time) / 1000)
}
