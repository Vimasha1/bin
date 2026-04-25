import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api.js'
import { useChatContext } from '../lib/ChatContext.jsx'

const SUGGESTED = [
  'Which bins need action now?',
  'Why is this bin marked Light Waste?',
  'Which location fills fastest?',
  'Are there any anomalies?',
  'What should the collection team do next?',
]

const ChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const CloseIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

function renderText(text) {
  if (!text) return null
  return text.split('\n').flatMap((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    const rendered = parts.map((part, pi) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={pi}>{part.slice(2, -2)}</strong>
        : part
    )
    return li === 0 ? rendered : [<br key={`br${li}`} />, ...rendered]
  })
}

export default function ChatBot() {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const { chatCtx } = useChatContext()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    // Build the payload — passes exactly what the dashboard is currently showing
    const payload = {
      message:              msg,
      page:                 chatCtx.page || 'operations',
      selected_bin:         chatCtx.selected_bin || null,
      selected_bin_name:    chatCtx.selected_bin_name || null,
      current_selected_bin: chatCtx.current_selected_bin || null,
      fleet_summary:        chatCtx.fleet_summary
        ? {
            total_bins:      chatCtx.fleet_summary.total_bins,
            summary:         chatCtx.fleet_summary.summary,
            requires_action: chatCtx.fleet_summary.requires_action,
            bins:            chatCtx.fleet_summary.bins,
          }
        : null,
      analytics_summary: chatCtx.analytics_summary || null,
    }
    try {
      const res = await api.chat(payload)
      setMessages(prev => [...prev, { role: 'assistant', text: res.response }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'error',
        text: 'Could not reach the assistant. Make sure the backend is running.',
      }])
    } finally {
      setLoading(false)
    }
  }

  // Context indicator shown in header
  const contextLabel = chatCtx.selected_bin_name
    ? `Answering for: ${chatCtx.selected_bin_name}`
    : `Answering for: ${chatCtx.page || 'dashboard'}`

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Smart Bin Assistant">
          <div className="chat-header">
            <div>
              <div className="chat-title">Smart Bin Assistant</div>
              <div className="chat-subtitle">{contextLabel}</div>
            </div>
            <button className="chat-close-btn" onClick={() => setOpen(false)} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <p className="chat-welcome-text">
                  Ask me about bin statuses, collection priorities, or anomalies across campus.
                </p>
                <div className="chat-chips">
                  {SUGGESTED.map(q => (
                    <button key={q} className="chat-chip" onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                  <span className="chat-msg-from">
                    {m.role === 'user' ? 'You' : m.role === 'error' ? 'Error' : 'Assistant'}
                  </span>
                  <div className="chat-bubble">{renderText(m.text)}</div>
                </div>
              ))
            )}

            {loading && (
              <div className="chat-msg chat-msg-assistant">
                <span className="chat-msg-from">Assistant</span>
                <div className="chat-bubble">
                  <div className="chat-typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              placeholder="Ask about bin status..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={loading}
              maxLength={500}
            />
            <button
              className="chat-send-btn"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        className={`chat-fab${open ? ' chat-fab-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close assistant' : 'Open Smart Bin Assistant'}
        title="Smart Bin Assistant"
      >
        {open ? <CloseIcon size={18} /> : <ChatIcon />}
      </button>
    </>
  )
}
