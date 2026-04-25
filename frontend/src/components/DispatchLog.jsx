import { fmt } from '../lib/api.js'

export default function DispatchLog({ entries }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="kicker">Recent Dispatches</div>
          <h3 className="font-serif" style={{ fontSize: 22, fontWeight: 400, marginTop: 4 }}>
            Today's <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>activity</em>
          </h3>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{
          padding: '32px 24px',
          textAlign: 'center',
          background: 'var(--bg-soft)',
          color: 'var(--ink-mute)',
          fontSize: 12.5,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
          border: '1px solid var(--border)'
        }}>
          No SMS dispatched yet. Select a bin above and dispatch when action is required.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', borderTop: '1px solid var(--border)' }}>
          {entries.slice(0, 10).map((entry, i) => (
            <li key={i} style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 16,
              padding: '14px 0',
              borderBottom: '1px solid var(--border-soft)'
            }}>
              <div className="font-mono" style={{
                fontSize: 11,
                color: 'var(--ink-mute)',
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
                paddingTop: 2
              }}>
                {fmt.datetime(entry.timestamp)}
              </div>
              <div>
                <div style={{ fontSize: 13.5 }}>
                  <span className="font-serif" style={{ fontWeight: 500 }}>{entry.bin_name}</span>
                  <span style={{ color: 'var(--ink-mute)' }}> · sent to </span>
                  <span style={{ fontWeight: 500 }}>{entry.collector_name}</span>
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'var(--ink-soft)',
                  marginTop: 4,
                  lineHeight: 1.4
                }}>
                  {entry.message}
                </div>
              </div>
              <div className="font-mono" style={{
                fontSize: 10,
                color: 'var(--green)',
                background: 'var(--green-soft)',
                padding: '3px 8px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                alignSelf: 'flex-start'
              }}>
                Sent
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
