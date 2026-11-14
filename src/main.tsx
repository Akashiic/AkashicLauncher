import React from 'react'
import ReactDOM from 'react-dom/client'
// Fontes empacotadas no app (funcionam offline)
import '@fontsource/league-gothic/latin-400.css'
import '@fontsource/league-gothic/latin-ext-400.css'
import '@fontsource/oswald/latin-400.css'
import '@fontsource/oswald/latin-600.css'
import '@fontsource/oswald/latin-700.css'
import '@fontsource/oswald/latin-ext-400.css'
import '@fontsource/oswald/latin-ext-600.css'
import '@fontsource/oswald/latin-ext-700.css'
import App from './App'
import { setupDesktop } from './lib/desktop'
import { MotionRoot } from './lib/motion'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionRoot>
      <App />
    </MotionRoot>
  </React.StrictMode>,
)

setupDesktop()
