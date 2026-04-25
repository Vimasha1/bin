import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { api } from './lib/api.js'
import ChatBot from './components/ChatBot.jsx'

export default function App() {
  const [now, setNow] = useState(new Date())
  const [backend, setBackend] = useState({ online: false, info: null })
  const location = useLocation()
  const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5050'

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    let alive = true
    const checkBackend = async () => {
      try {
        const info = await api.serviceInfo()
        if (alive) setBackend({ online: true, info })
      } catch (e) {
        if (alive) setBackend({ online: false, info: null })
      }
    }
    checkBackend()
    const id = setInterval(checkBackend, 15000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const analyticsPath = location.pathname.startsWith('/bin/')
    ? location.pathname
    : '/bin/smartbin_01'

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <NavLink to="/" className="brand">
            <span className="brand-mark">SLIIT <em>Bin Operations</em></span>
            <span className="brand-sub">Live fleet decisions</span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to={analyticsPath} className={location.pathname.startsWith('/bin/') ? 'active' : undefined}>
              Analytics / Insights
            </NavLink>
          </nav>
        </div>
        <div className="topbar-right">
          <div className={`status-chip ${backend.online ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            {backend.online ? 'Online' : 'Offline'}
          </div>
          <span className="clock">{now.toLocaleTimeString('en-GB')}</span>
        </div>
      </header>

      {!backend.online && (
        <div className="error-banner">
          Backend not reachable at <span style={{fontWeight:600}}>{backendUrl}</span>.
          Check <code>VITE_API_BASE_URL</code> or start <code>python3 app.py</code> in the local_backend folder.
        </div>
      )}

      <Outlet context={{ backend }} />
      <ChatBot />
    </div>
  )
}
