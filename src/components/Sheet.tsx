import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Bottom sheet modal, iOS style: slides up, and can be dismissed by tapping
 * the backdrop, the Close button, Escape, or dragging the top bar down.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const [drag, setDrag] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    setDrag(0)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    startY.current = e.clientY
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current === null) return
    setDrag(Math.max(0, e.clientY - startY.current))
  }
  const onPointerUp = () => {
    if (startY.current === null) return
    startY.current = null
    if (drag > 90) onClose()
    else setDrag(0)
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center"
      style={{ bottom: 'calc(-1 * var(--vp-gap, 0px))' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        className="animate-[fade-in_150ms_ease-out] absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className="pb-safe relative max-h-[90dvh] w-full max-w-xl animate-[sheet-up_220ms_cubic-bezier(0.2,0.8,0.2,1)] overflow-y-auto overscroll-contain rounded-t-3xl bg-white shadow-xl dark:bg-slate-900"
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sticky top-0 z-10 cursor-grab touch-none border-b border-slate-200 bg-white px-4 pt-2 pb-3 dark:border-slate-800 dark:bg-slate-900"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400">
              Close
            </button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
