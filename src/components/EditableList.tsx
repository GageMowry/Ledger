import { useState } from 'react'
import { addTo } from '../meals'

/**
 * A scrollable list of text rows with an add field on top and a delete button
 * on each row. Paste "a, b, c" to add several at once.
 */
export default function EditableList({
  title,
  description,
  items,
  onChange,
  placeholder,
  emptyText,
  tone = 'slate',
  maxHeight = 'max-h-64',
}: {
  title: string
  description?: string
  items: string[]
  onChange: (next: string[]) => void
  placeholder: string
  emptyText: string
  tone?: 'slate' | 'green' | 'amber' | 'red'
  maxHeight?: string
}) {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState('')

  const dot = {
    slate: 'bg-slate-400',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-rose-500',
  }[tone]

  const add = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    onChange(addTo(items, parts))
    setText('')
  }

  const shown = filter.trim() ? items.filter((i) => i.toLowerCase().includes(filter.trim().toLowerCase())) : items

  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {title} <span className="text-sm font-normal text-slate-400">{items.length}</span>
        </h2>
      </div>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          className="field"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Add to ${title}`}
          enterKeyHint="done"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!text.trim()}>
          Add
        </button>
      </form>

      {items.length > 12 && (
        <input
          className="field mt-2 py-2 text-sm"
          type="search"
          placeholder={`Search ${title.toLowerCase()}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={`Search ${title}`}
        />
      )}

      {items.length ? (
        <ul
          className={`mt-3 ${maxHeight} divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800`}
          aria-label={title}
        >
          {shown.map((item) => (
            <li key={item} className="flex items-center gap-3 py-2 pr-1 pl-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm break-words">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="rounded-full px-2.5 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                onClick={() => onChange(items.filter((x) => x !== item))}
              >
                ✕
              </button>
            </li>
          ))}
          {!shown.length && <li className="py-3 text-center text-sm text-slate-500">No matches.</li>}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyText}
        </p>
      )}
    </section>
  )
}
