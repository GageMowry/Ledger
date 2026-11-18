import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSearchUsage, type WebSource } from '../gemini'

function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
    </svg>
  )
}

/**
 * Web search toggle for a Maker. Searching uses Gemini 2.5 Flash, which is
 * capped per day, so the remaining count is always shown.
 */
export function WebToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const usage = useLiveQuery(getSearchUsage, [])
  const left = usage?.left ?? 0
  const empty = usage !== undefined && left <= 0

  // Out of searches for today: switch it off.
  useEffect(() => {
    if (empty && on) onChange(false)
  }, [empty, on, onChange])

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={empty}
        onClick={() => onChange(!on)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition disabled:opacity-50 ${
          on
            ? 'bg-sky-600 text-white shadow-sm'
            : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
        }`}
      >
        <GlobeIcon className="h-4 w-4" />
        Web {on ? 'on' : 'off'}
      </button>
      {/* Kept short, and allowed to wrap onto two tight lines on narrow phones,
          so it never pushes into the New chat button beside it. */}
      <span className="min-w-0 leading-tight text-slate-500 dark:text-slate-400">
        {usage === undefined
          ? ''
          : empty
            ? `None left today (${usage.limit}/day)`
            : on
              ? `${left} of ${usage.limit} left today · 2.5 Flash`
              : `${left} of ${usage.limit} left today`}
      </span>
    </div>
  )
}

export function Sources({ sources }: { sources?: WebSource[] }) {
  if (!sources?.length) return null
  return (
    <div className="rounded-xl bg-sky-50 px-3 py-2 text-xs dark:bg-sky-950/50">
      <p className="flex items-center gap-1 font-semibold text-sky-800 dark:text-sky-300">
        <GlobeIcon className="h-3.5 w-3.5" /> Sources
      </p>
      <ol className="mt-1 space-y-0.5">
        {sources.map((s, i) => (
          <li key={s.uri} className="truncate">
            <span className="text-sky-700/70 dark:text-sky-400/70">{i + 1}. </span>
            <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline underline-offset-2 dark:text-sky-300">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function SearchedBadge() {
  return (
    <span className="mr-1.5 inline-flex translate-y-0.5 items-center" title="Sent with web search">
      <GlobeIcon className="h-3.5 w-3.5 opacity-80" />
    </span>
  )
}
