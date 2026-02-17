import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ClientApp from './ClientApp.jsx'

const isClient = window.location.pathname.startsWith('/client');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isClient ? <ClientApp /> : <App />}
  </StrictMode>,
)
