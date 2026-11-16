import { useEffect, useRef, useState } from 'react'

/**
 * Segmented section tabs that float under the header: they slide away while
 * scrolling down and come back the moment you scroll up. The ribbon's current
 * height is published as --ribbon-offset so other sticky bars can sit below it.
 */
export default function SectionRibbon<T extends string>({
  sections,
  value,
  onChange,
}: {
  sections: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(true)
  const [floating, setFloating] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - lastY
      if (y < 8) setShown(true)
      else if (dy < -1) setShown(true) // any upward scroll brings it back
      else if (dy > 4 && y > 60) setShown(false)
      setFloating(y > 8)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const h = ref.current?.offsetHeight ?? 0
    root.style.setProperty('--ribbon-offset', shown ? `${h}px` : '0px')
    return () => root.style.setProperty('--ribbon-offset', '0px')
  }, [shown])

  // Switching sections always shows the ribbon again.
  useEffect(() => setShown(true), [value])

  return (
    <div
      ref={ref}
      className={`sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[6] -mx-4 px-4 py-2 transition-[transform,opacity] duration-200 ease-out ${
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-[120%] opacity-0'
      }`}
    >
      <div
        role="tablist"
        className={`grid gap-1 rounded-xl p-1 transition-shadow ${
          floating
            ? 'bg-white/90 shadow-lg ring-1 shadow-slate-900/10 ring-slate-200 backdrop-blur dark:bg-slate-800/90 dark:ring-slate-700'
            : 'bg-slate-200/70 dark:bg-slate-800'
        }`}
        style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={value === s.id}
            onClick={() => onChange(s.id)}
            className={`rounded-lg py-1.5 text-sm font-medium ${
              value === s.id
                ? floating
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white shadow-sm dark:bg-slate-700'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
