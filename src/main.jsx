import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import GlassHUD from './glass/GlassHUD.jsx'

const isGlass = window.location.pathname === '/glass'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isGlass ? <GlassHUD /> : <App />}
  </StrictMode>,
)
