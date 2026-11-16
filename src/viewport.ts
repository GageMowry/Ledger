/**
 * iOS home-screen apps using the translucent status bar can report a layout
 * viewport that's shorter than the screen (roughly by the status bar height).
 * Anything pinned to `bottom: 0` then floats above the real bottom, leaving a
 * blank band under the tab bar.
 *
 * We measure that gap and publish it as --vp-gap; bottom-pinned bars shift
 * down by it. Outside the installed app, or when iOS reports correctly, the
 * gap is 0 and nothing moves.
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
    root.style.setProperty('--vp-gap', `${latest.gap}px`)
  }
  update()
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', () => setTimeout(update, 300))
  window.visualViewport?.addEventListener('resize', update)
}

export function viewportInfo(): ViewportInfo {
  return latest ?? measure()
}
