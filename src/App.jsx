import React, { useState } from 'react'
import ChatWorkspace from './components/ChatWorkspace/ChatWorkspace'
import ResearchWorkspace from './components/ResearchWorkspace/ResearchWorkspace'
import './App.css'

const App = () => {
  const [mode, setMode] = useState('research')

  return (
    <div className="app-mode-root">
      <section
        id="workspace-chat"
        className="mode-panel"
        role="tabpanel"
        aria-label="普通对话"
        hidden={mode !== 'chat'}
      >
        <ChatWorkspace onModeChange={setMode} />
      </section>
      <section
        id="workspace-research"
        className="mode-panel"
        role="tabpanel"
        aria-label="知识研究"
        hidden={mode !== 'research'}
      >
        <ResearchWorkspace onModeChange={setMode} />
      </section>
    </div>
  )
}

export default App
