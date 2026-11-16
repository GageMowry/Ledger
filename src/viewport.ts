/**
 * Viewport diagnostics, shown in Settings.
 *
 * Background: with the translucent status bar style, some iPhones gave the
 * home-screen app a web view that was a status bar's height short at the
 * bottom (e.g. screen 844, view 797). That strip can't be drawn into, so
 * shifting bars down only clipped them. The fix was switching to the standard
 * status bar style in index.html. This module now only reports the numbers;
 * --vp-gap stays 0.
 */

export interface ViewportInfo {
  standalone: boolean
  screenH: number
  innerH: number
  visualH: number
  gap: number
}

let latest: ViewportInfo | null = null

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  )
}

function measure(): ViewportInfo {
  const standalone = isStandalone()
  const portrait = window.innerHeight >= window.innerWidth
  // screen.width/height don't rotate on iOS; pick the side that matches the orientation.
  const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
  const innerH = window.innerHeight
  const visualH = window.visualViewport?.height ?? innerH
  const raw = Math.round(screenH - innerH)
  // Only correct a plausible status-bar-sized gap in the installed app, and
  // not while the keyboard is open (that also shrinks the viewport).
  const keyboardOpen = visualH < innerH - 120
  const gap = standalone && !keyboardOpen && raw > 0 && raw <= 80 ? raw : 0
  return { standalone, screenH, innerH, visualH: Math.round(visualH), gap }
}

export function installViewportFix(): void {
  const root = document.documentElement
  const update = () => {
    latest = measure()
    root.style.setProperty('--vp-gap', '0px')
  }
  update()
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', () => setTimeout(update, 300))
  window.visualViewport?.addEventListener('resize', update)
}

export function viewportInfo(): ViewportInfo {
  return latest ?? measure()
}
