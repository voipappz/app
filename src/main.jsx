import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import i18n from './i18n/config' // Initialize i18n
import App from './App.jsx'
import { APP_DIRECTION } from './theme/muiTheme'
import { brand } from './config'
import { loadCustomerPortalData, getCustomerData } from './lib/clients/customerPortal'

// Boot: load the customer portal data (logo/title/colour/language) BEFORE the
// first render so the LOGIN page is already branded — no flash of the default
// brand. It's PUBLIC (no auth) and served from the API's customer.profile, so a
// tenant rebrands with no code change. Never throws: on failure we fall back to
// the env-driven defaults in src/config.js.
// NB: wrapped in an async fn, NOT top-level await — the build target (es2020/
// safari14) doesn't support top-level await.
async function boot() {
  await loadCustomerPortalData()

  // Language + direction: the customer's setting wins, else the build default.
  const portalLang = getCustomerData()?.language
  if (portalLang) i18n.changeLanguage(portalLang)
  const dir = portalLang ? (portalLang === 'he' ? 'rtl' : 'ltr') : APP_DIRECTION
  document.documentElement.dir = dir
  document.documentElement.lang = portalLang || (APP_DIRECTION === 'rtl' ? 'he' : 'en')

  // Apply the brand (title → tab, icon → favicon). `brand` reads the cached
  // portal data first, then VITE_*, then the bundled defaults.
  document.title = brand.name
  const favicon = document.querySelector("link[rel='icon']")
  if (favicon) favicon.href = brand.icon || brand.logo

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

boot()
