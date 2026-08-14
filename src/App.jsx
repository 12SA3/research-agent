import React, { useEffect, useState } from 'react'
import ChatWorkspace from './components/ChatWorkspace/ChatWorkspace'
import ResearchWorkspace from './components/ResearchWorkspace/ResearchWorkspace'
import './App.css'

const App = () => {
  const [mode, setMode] = useState(() => window.location.hash === '#chat' ? 'chat' : 'research')

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#research')
    const handleHashChange = () => setMode(window.location.hash === '#chat' ? 'chat' : 'research')
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const changeMode = (nextMode) => {
    setMode(nextMode)
    window.history.replaceState(null, '', `#${nextMode}`)
  }

  return (
    <div className="app-mode-root">
      <a className="skip-link" href={mode === 'chat' ? '#chat-workspace-content' : '#research-workspace-content'}>跳到主要内容</a>
      <section
        id="workspace-chat"
        className="mode-panel"
        role="tabpanel"
        aria-label="普通对话"
        hidden={mode !== 'chat'}
      >
        <ChatWorkspace onModeChange={changeMode} />
      </section>
      <section
        id="workspace-research"
        className="mode-panel"
        role="tabpanel"
        aria-label="知识研究"
        hidden={mode !== 'research'}
      >
        <ResearchWorkspace onModeChange={changeMode} />
      </section>
    </div>
  )
}

export default App
