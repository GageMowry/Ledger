import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Run } from '../../db'
import { addDays, friendlyDate, todayISO } from '../../dates'
import { fmtNum, formatDuration, pace, parseDuration, sortByDate } from '../../body'
import LineChart from '../../components/LineChart'

function RunForm() {
  const [date, setDate] = useState(todayISO())
  const [distance, setDistance] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')

  const dist = Number(distance)
  const sec = parseDuration(time)
  const valid = dist > 0 && !!sec && sec > 0

  async function save() {
    if (!valid) return
    await db.runs.add({ date, distanceMi: dist, durationSec: sec!, notes: notes.trim() || undefined, createdAt: Date.now() } as Run)
    setDistance('')
    setTime('')
    setNotes('')
    setDate(todayISO())
  }

  return (
    <section className="card">
      <h2 className="font-semibold">Log a run</h2>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="font-medium">Distance (mi)</span>
            <input className="field mt-1" inputMode="decimal" placeholder="3.1" value={distance} onChange={(e) => setDistance(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium">Time</span>
            <input className="field mt-1" inputMode="numeric" placeholder="mm:ss or h:mm:ss" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="font-medium">Date</span>
            <input type="date" className="field mt-1" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="text-sm">
            <span className="font-medium">Pace</span>
            <p className="mt-1 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
              {valid ? `${formatDuration(pace(dist, sec!))} /mi` : '—'}
            </p>
          </div>
        </div>
        <input className="field" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {time && !sec && <p className="text-xs text-rose-600">Enter time like 25:30 or 1:05:00.</p>}
        <button type="submit" className="btn-primary w-full" disabled={!valid}>
          Save run
        </button>
      </form>
    </section>
  )
}

export default function Runs() {
  const runs = useLiveQuery(() => db.runs.toArray(), [])
  const sorted = useMemo(() => sortByDate(runs ?? []), [runs])
  if (!runs) return null

  const monthAgo = addDays(todayISO(), -30)
  const recent = sorted.filter((r) => r.date >= monthAgo)
  const bestPace = sorted.reduce<Run | null>((b, r) => (!b || pace(r.distanceMi, r.durationSec) < pace(b.distanceMi, b.durationSec) ? r : b), null)
  const longest = sorted.reduce<Run | null>((b, r) => (!b || r.distanceMi > b.distanceMi ? r : b), null)

  const stats = [
    { label: 'Last 30 days', value: `${fmtNum(recent.reduce((s, r) => s + r.distanceMi, 0))} mi`, sub: `${recent.length} run${recent.length === 1 ? '' : 's'}` },
    { label: 'Best pace', value: bestPace ? `${formatDuration(pace(bestPace.distanceMi, bestPace.durationSec))}` : '—', sub: bestPace ? `/mi · ${fmtNum(bestPace.distanceMi)} mi` : '' },
    { label: 'Longest', value: longest ? `${fmtNum(longest.distanceMi)} mi` : '—', sub: longest ? friendlyDate(longest.date) : '' },
  ]

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="grid grid-cols-3 divide-x divide-slate-200 text-center dark:divide-slate-800">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.sub}</p>
            </div>
          ))}
        </div>
        {sorted.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Pace (min/mi, lower is faster)</p>
            <LineChart
              points={sorted.map((r) => ({ date: r.date, value: pace(r.distanceMi, r.durationSec) }))}
              format={formatDuration}
              label="Pace"
            />
          </div>
        )}
      </section>

      <RunForm />

      {sorted.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Recent runs</h2>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {[...sorted].reverse().slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">
                    {fmtNum(r.distanceMi, 2)} mi in {formatDuration(r.durationSec)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {friendlyDate(r.date)}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <p className="tabular-nums text-slate-600 dark:text-slate-300">{formatDuration(pace(r.distanceMi, r.durationSec))}/mi</p>
              </li>
            ))}
          </ul>
          {sorted.length > 10 && <p className="mt-2 text-xs text-slate-400">See History for all runs.</p>}
        </section>
      )}
    </div>
  )
}
