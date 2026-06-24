import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config' // Initialize i18n
import App from './App.jsx'
import { APP_DIRECTION } from './theme/muiTheme'
import { brand } from './config'

// Set global direction dynamically based on config
document.documentElement.dir = APP_DIRECTION
document.documentElement.lang = APP_DIRECTION === 'rtl' ? 'he' : 'en'

// Apply the env-driven brand (name → tab title, logo → favicon).
document.title = brand.name
const favicon = document.querySelector("link[rel='icon']")
if (favicon) favicon.href = brand.logo

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
