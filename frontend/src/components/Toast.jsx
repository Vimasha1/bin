export default function Toast({ kind, title, body }) {
  return (
    <div className="toast" style={{
      borderLeft: `3px solid ${kind === 'sent' ? 'var(--green)' : 'var(--red)'}`
    }}>
      <div>
        <div className="kicker" style={{ color: kind === 'sent' ? 'var(--green)' : 'var(--red)' }}>
          {title}
        </div>
        <div style={{ fontSize: 13, marginTop: 2 }}>{body}</div>
      </div>
    </div>
  )
}
