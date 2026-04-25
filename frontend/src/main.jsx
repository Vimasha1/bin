import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Operations from './pages/Operations.jsx'
import Analytics from './pages/Analytics.jsx'
import { ChatProvider } from './lib/ChatContext.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ChatProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Operations />} />
            <Route path="bin/:binId" element={<Analytics />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ChatProvider>
  </React.StrictMode>
)
