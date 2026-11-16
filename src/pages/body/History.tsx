import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { friendlyDate } from '../../dates'
import { LIFTS, MEASURE_BY_KEY, fmtNum, formatDuration, pace } from '../../body'

type Kind = 'weight' | 'measure' | 'lift' | 'run'

interface Item {
  key: string
  kind: Kind
  date: string
  createdAt: number
  title: string
  value: string
  remove: () => Promise<void>
}

const FILTERS: { id: Kind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'weight', label: 'Weight' },
  { id: 'measure', label: 'Measurements' },
  { id: 'lift', label: 'Lifts' },
  { id: 'run', label: 'Runs' },
]

const LIFT_BY_KEY = Object.fromEntries(LIFTS.map((l) => [l.key, l]))

export default function History() {
  const data = useLiveQuery(async () => ({
    measurements: await db.measurements.toArray(),
    lifts: await db.lifts.toArray(),
    runs: await db.runs.toArray(),
  }))
  const [filter, setFilter] = useState<Kind | 'all'>('all')

  const groups = useMemo(() => {
    if (!data) return []
    const items: Item[] = [
      ...data.measurements.map((m) => ({
        key: `m${m.id}`,
        kind: (m.metric === 'weight' ? 'weight' : 'measure') as Kind,
        date: m.date,
        createdAt: m.createdAt,
        title: m.metric === 'weight' ? 'Weight' : (MEASURE_BY_KEY[m.metric]?.label ?? m.metric),
        value: m.metric === 'weight' ? `${fmtNum(m.value)} lbs` : `${fmtNum(m.value, 2)}″`,
        remove: () => db.measurements.delete(m.id),
      })),
      ...data.lifts.map((l) => ({
        key: `l${l.id}`,
        kind: 'lift' as Kind,
        date: l.date,
        createdAt: l.createdAt,
        title: LIFT_BY_KEY[l.lift]?.label ?? l.lift,
        value: `${fmtNum(l.value)} ${LIFT_BY_KEY[l.lift]?.unit ?? ''}`,
        remove: () => db.lifts.delete(l.id),
      })),
      ...data.runs.map((r) => ({
        key: `r${r.id}`,
        kind: 'run' as Kind,
        date: r.date,
        createdAt: r.createdAt,
        title: `Run · ${fmtNum(r.distanceMi, 2)} mi`,
        value: `${formatDuration(r.durationSec)} (${formatDuration(pace(r.distanceMi, r.durationSec))}/mi)`,
        remove: () => db.runs.delete(r.id),
      })),
    ]
      .filter((i) => filter === 'all' || i.kind === filter)
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))

    const byDate = new Map<string, Item[]>()
    for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i])
    return [...byDate.entries()]
  }, [data, filter])

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="card text-center text-sm text-slate-500 dark:text-slate-400">No entries yet.</p>
      ) : (
        groups.map(([date, items]) => (
          <section key={date} className="card py-2">
            <h2 className="pt-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {friendlyDate(date)}
              <span className="ml-1 font-normal normal-case">· {date}</span>
            </h2>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((i) => (
                <li key={i.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{i.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{i.value}</span>
                    <button
                      type="button"
                      aria-label={`Delete ${i.title} entry`}
                      className="rounded-full px-2 py-1 text-slate-400 hover:text-rose-600"
                      onClick={() => {
                        if (confirm(`Delete ${i.title} (${i.value}) from ${friendlyDate(i.date)}?`)) void i.remove()
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
