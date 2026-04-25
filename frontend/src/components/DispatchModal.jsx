import { useState, useEffect } from 'react'

export default function DispatchModal({ bin, initialMessage, onCancel, onSend }) {
  const [message, setMessage] = useState(initialMessage)
  const [sending, setSending] = useState(false)

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const handleSend = async () => {
    setSending(true)
    await onSend(message)
    // sending stays until parent unmounts modal
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)' }}>
          <div className="kicker">Dispatch Message</div>
          <h3 className="font-serif" style={{
            fontSize: 24, fontWeight: 400, marginTop: 6
          }}>
            {bin.location}
          </h3>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            {bin.sensor_id} · {bin.status} · {bin.action}
          </div>
        </div>

        <div style={{ padding: '20px 28px' }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Message Preview</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              padding: '12px 14px',
              fontFamily: 'var(--font-sans)',
              fontSize: 13.5,
              lineHeight: 1.55,
              color: 'var(--ink)',
              background: 'var(--bg)',
              resize: 'vertical',
              outline: 'none'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--ink)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>
            {message.length} characters · 1 SMS
          </div>

          <div style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'var(--bg-soft)',
            fontSize: 11,
            color: 'var(--ink-soft)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em'
          }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>NOTE</span> SMS gateway integration is simulated for demonstration. Production deployment would route through Twilio or local SMS API.
          </div>
        </div>

        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10
        }}>
          <button className="btn-ghost btn" onClick={onCancel} disabled={sending}>
            Cancel
          </button>
          <button className="btn" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : 'Dispatch SMS'}
          </button>
        </div>
      </div>
    </div>
  )
}
