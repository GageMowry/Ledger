import { useEffect, useState } from 'react'

/** Shown when a new version of the app has downloaded and is ready to use. */
export default function UpdateBanner() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const on = () => setReady(true)
    window.addEventListener('ledger:update-ready', on)
    return () => window.removeEventListener('ledger:update-ready', on)
  }, [])

  if (!ready) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 px-4 pb-2 animate-[slide-up-in_250ms_ease-out]"
      style={{ bottom: 'calc(var(--nav-h, 64px) + var(--composer-h, 0px) - var(--vp-gap, 0px))' }}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-white dark:text-slate-900">
        <span>A new version of Ledger is ready.</span>
        <span className="flex shrink-0 gap-2">
          <button type="button" className="rounded-lg px-2 py-1 opacity-70" onClick={() => setReady(false)}>
            Later
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-500 px-3 py-1 font-semibold text-white"
            onClick={() => (window as unknown as { __applyUpdate?: () => void }).__applyUpdate?.()}
          >
            Update
          </button>
        </span>
      </div>
    </div>
  )
}
