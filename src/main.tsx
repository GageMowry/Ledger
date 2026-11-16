import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { installViewportFix } from './viewport'

installViewportFix()

// A new version is downloaded in the background; the app shows an "Update" bar
// instead of reloading on its own (see UpdateBanner).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('ledger:update-ready'))
  },
})
;(window as unknown as { __applyUpdate?: () => void }).__applyUpdate = () => void updateSW(true)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
