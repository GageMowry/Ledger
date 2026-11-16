import { useState } from 'react'

/** Type and press return (or comma) to add a chip; tap ✕ to remove. */
export default function ChipInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
  tone = 'slate',
  label,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  suggestions?: string[]
  tone?: 'slate' | 'green' | 'red' | 'amber'
  label: string
}) {
  const [text, setText] = useState('')
  const listId = `chips-${label.replace(/\W/g, '')}`

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const next = [...values]
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p)
    onChange(next)
    setText('')
  }

  const toneClass = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    green: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    red: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  }[tone]

  return (
    <div>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((v) => (
            <li key={v} className={`flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm ${toneClass}`}>
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded-full px-1.5 opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className="field"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        list={suggestions.length ? listId : undefined}
        enterKeyHint="done"
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(',')) add(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (text.trim()) add(text)
          }
        }}
        onBlur={() => text.trim() && add(text)}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.filter((s) => !values.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  )
}
