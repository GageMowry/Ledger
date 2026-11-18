import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LiftEntry } from '../../db'
import { friendlyDate, todayISO } from '../../dates'
import { LIFTS, addLift, fmtNum, sortByDate } from '../../body'
import LineChart from '../../components/LineChart'

function LiftCard({ def, entries }: { def: (typeof LIFTS)[number]; entries: LiftEntry[] }) {
  const [input, setInput] = useState('')
  const [date, setDate] = useState(todayISO())
  const sorted = sortByDate(entries)
  const pr = sorted.reduce<LiftEntry | null>((best, e) => (!best || e.value > best.value ? e : best), null)
  const last = sorted[sorted.length - 1]
  const unit = def.unit

  async function save() {
    const v = Number(input)
    if (v > 0) {
      await addLift(def.key, v, date)
      setInput('')
      setDate(todayISO())
    }
  }

  const newPr = Number(input) > 0 && (!pr || Number(input) > pr.value)

  return (
    <section className="card">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{def.label}</h2>
          {last && last !== pr && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last: {fmtNum(last.value)} {unit} · {friendlyDate(last.date)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 dark:text-slate-400">PR</p>
          <p className="text-2xl font-semibold tabular-nums">
            {pr ? fmtNum(pr.value) : '—'} <span className="text-sm font-normal text-slate-500">{unit}</span>
          </p>
          {pr && <p className="text-xs text-slate-500 dark:text-slate-400">{friendlyDate(pr.date)}</p>}
        </div>
      </div>

      <div className="mt-3">
        <LineChart points={sorted} format={(v) => fmtNum(v)} label={def.label} />
      </div>

      {/* On very narrow phones the date and Log button drop to a second line
          rather than squeezing the number box. */}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          className="field min-w-[5.5rem] grow-[999] basis-0"
          inputMode="decimal"
          placeholder={unit === 'reps' ? 'Reps' : 'Weight'}
          aria-label={`${def.label} (${unit})`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <input
          type="date"
          className="field w-[8.75rem] shrink-0 px-2 text-sm"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
        />
        <button type="submit" className="btn-primary shrink-0 grow" disabled={!(Number(input) > 0)}>
          Log
        </button>
      </form>
      {newPr && <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">That's a new PR.</p>}
    </section>
  )
}

export default function Lifts() {
  const entries = useLiveQuery(() => db.lifts.toArray(), [])
  if (!entries) return null
  return (
    <div className="space-y-4">
      {LIFTS.map((def) => (
        <LiftCard key={def.key} def={def} entries={entries.filter((e) => e.lift === def.key)} />
      ))}
    </div>
  )
}
