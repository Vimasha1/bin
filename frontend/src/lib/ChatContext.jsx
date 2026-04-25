import { createContext, useContext, useState, useCallback } from 'react'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const [chatCtx, setChatCtx] = useState({
    page: 'operations',
    selected_bin: null,
    selected_bin_name: null,
    current_selected_bin: null,
    fleet_summary: null,
    analytics_summary: null,
  })

  const updateChatContext = useCallback((updates) => {
    setChatCtx(prev => ({ ...prev, ...updates }))
  }, [])

  return (
    <ChatContext.Provider value={{ chatCtx, updateChatContext }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) return { chatCtx: {}, updateChatContext: () => {} }
  return ctx
}
