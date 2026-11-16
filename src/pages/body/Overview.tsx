import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Measurement } from '../../db'
import { todayISO, friendlyDate } from '../../dates'
import {
  HEIGHT_IN,
  MEASUREMENTS,
  MEASURE_BY_KEY,
  addLift,
  addMeasurements,
  bmi,
  fmtNum,
  formatHeight,
  latestByMetric,
  sortByDate,
  suggestedSizes,
} from '../../body'
import BodyFigure from '../../components/BodyFigure'
import LineChart from '../../components/LineChart'
import Sheet from '../../components/Sheet'

// three.js is large, so the 3D model loads only when the Body tab opens.
const Body3D = lazy(() => import('../../body3d/Body3D'))

function QuickStart() {
  const [vals, setVals] = useState({ weight: '', squat: '', bench: '', pullups: '' })
  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement>) => setVals({ ...vals, [k]: e.target.value })
  const num = (s: string) => Number(s)
  const any = Object.values(vals).some((v) => num(v) > 0)

  async function save() {
    if (num(vals.weight) > 0) await addMeasurements({ weight: num(vals.weight) })
    if (num(vals.squat) > 0) await addLift('squat', num(vals.squat))
    if (num(vals.bench) > 0) await addLift('bench', num(vals.bench))
    if (num(vals.pullups) > 0) await addLift('pullups', num(vals.pullups))
  }

  const fields: { k: keyof typeof vals; label: string; unit: string }[] = [
    { k: 'weight', label: 'Weight', unit: 'lbs' },
    { k: 'squat', label: 'Squat', unit: 'lbs' },
    { k: 'bench', label: 'Bench', unit: 'lbs' },
    { k: 'pullups', label: 'Pull-ups', unit: 'reps' },
  ]

  return (
    <section className="card border-l-4 border-indigo-500">
      <h2 className="font-semibold">Starting numbers</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter where you are today. Leave any blank.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <label key={f.k} className="text-sm">
            <span className="font-medium">{f.label}</span>
            <div className="relative mt-1">
              <input
                className="field pr-12"
                inputMode="decimal"
                aria-label={`${f.label} (${f.unit})`}
                value={vals[f.k]}
                onChange={set(f.k)}
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{f.unit}</span>
            </div>
          </label>
        ))}
      </div>
      <button type="button" className="btn-primary mt-4 w-full" disabled={!any} onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}

function UpdateAllSheet({
  open,
  onClose,
  latest,
}: {
  open: boolean
  onClose: () => void
  latest: Record<string, Measurement>
}) {
  const [date, setDate] = useState(todayISO())
  const [vals, setVals] = useState<Record<string, string>>({})

  async function save() {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(vals)) if (Number(v) > 0) parsed[k] = Number(v)
    await addMeasurements(parsed, date)
    setVals({})
    onClose()
  }

  const filled = Object.values(vals).filter((v) => Number(v) > 0).length

  return (
    <Sheet open={open} onClose={onClose} title="Update measurements">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Inches. Only fill in what you measured; blank ones keep their last value.
      </p>
      <label className="mt-3 block text-sm font-medium">
        Date
        <input type="date" className="field mt-1" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      {(['Jacket & shirt', 'Pants'] as const).map((group) => (
        <div key={group} className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{group}</h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {MEASUREMENTS.filter((m) => m.group === group).map((m) => (
              <label key={m.key} className="text-sm">
                <span className="font-medium">{m.label}</span>
                <input
                  className="field mt-1"
                  inputMode="decimal"
                  placeholder={latest[m.key] ? fmtNum(latest[m.key].value, 2) : '—'}
                  value={vals[m.key] ?? ''}
                  onChange={(e) => setVals({ ...vals, [m.key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn-primary mt-5 w-full" disabled={!filled} onClick={() => void save()}>
        Save {filled ? `${filled} measurement${filled === 1 ? '' : 's'}` : ''}
      </button>
    </Sheet>
  )
}

function MeasurementDetail({ metric, rows }: { metric: string; rows: Measurement[] }) {
  const def = MEASURE_BY_KEY[metric]
  const history = sortByDate(rows.filter((r) => r.metric === metric))
  const cur = history[history.length - 1]
  const prev = history[history.length - 2]
  const [input, setInput] = useState('')

  async function save() {
    const v = Number(input)
    if (v > 0) {
      await addMeasurements({ [metric]: v })
      setInput('')
    }
  }

  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{def.label}</h3>
        <p className="text-xl font-semibold tabular-nums">
          {cur ? `${fmtNum(cur.value, 2)}″` : <span className="text-base font-normal text-slate-400">Not measured</span>}
        </p>
      </div>
      {cur && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {friendlyDate(cur.date)}
          {prev && ` · ${cur.value >= prev.value ? '+' : ''}${fmtNum(cur.value - prev.value, 2)}″ since ${friendlyDate(prev.date)}`}
        </p>
      )}
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{def.how}</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          className="field"
          inputMode="decimal"
          placeholder={`New ${def.label.toLowerCase()} (in)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!(Number(input) > 0)}>
          Update
        </button>
      </form>
    </div>
  )
}

export default function Overview() {
  const rows = useLiveQuery(() => db.measurements.toArray(), [])
  const liftCount = useLiveQuery(() => db.lifts.count(), [])
  const [selected, setSelected] = useState('chest')
  const [weightInput, setWeightInput] = useState('')
  const [updateAll, setUpdateAll] = useState(false)
  const closeUpdateAll = useCallback(() => setUpdateAll(false), [])

  const all = useMemo(() => rows ?? [], [rows])
  const latest = useMemo(() => latestByMetric(all), [all])
  const weights = useMemo(() => sortByDate(all.filter((r) => r.metric === 'weight')), [all])
  const sizes = suggestedSizes(latest)

  // Timeline: every date with a tape measurement. The model shows the body as of the chosen date.
  const dates = useMemo(
    () => [...new Set(all.filter((r) => r.metric !== 'weight').map((r) => r.date))].sort(),
    [all],
  )
  const [pickedIdx, setViewIdx] = useState<number | null>(null)
  const [compare, setCompare] = useState(false)
  const [use3D, setUse3D] = useState(true)
  const viewIdx = pickedIdx === null || pickedIdx >= dates.length ? dates.length - 1 : pickedIdx
  const snapshot = useMemo(
    () => (viewIdx < 0 ? latest : latestByMetric(all.filter((r) => r.date <= dates[viewIdx]))),
    [all, dates, viewIdx, latest],
  )
  const snapshotValues = useMemo(
    () => Object.fromEntries(Object.entries(snapshot).map(([k, m]) => [k, m.value])),
    [snapshot],
  )
  const atLatest = viewIdx === dates.length - 1
  const latestValues = useMemo(
    () => Object.fromEntries(Object.entries(latest).map(([k, m]) => [k, m.value])),
    [latest],
  )
  const firstValues = useMemo(
    () =>
      dates.length
        ? Object.fromEntries(Object.entries(latestByMetric(all.filter((r) => r.date <= dates[0]))).map(([k, m]) => [k, m.value]))
        : {},
    [all, dates],
  )
  const curW = weights[weights.length - 1]
  const prevW = weights[weights.length - 2]

  if (rows === undefined || liftCount === undefined) return null
  const empty = !all.length && !liftCount

  async function logWeight() {
    const v = Number(weightInput)
    if (v > 0) {
      await addMeasurements({ weight: v })
      setWeightInput('')
    }
  }

  return (
    <div className="space-y-4">
      {empty && <QuickStart />}

      <section className="card">
        <div className="grid grid-cols-3 divide-x divide-slate-200 text-center dark:divide-slate-800">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Height</p>
            <p className="text-lg font-semibold">{formatHeight(HEIGHT_IN)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Weight</p>
            <p className="text-lg font-semibold tabular-nums">{curW ? `${fmtNum(curW.value)} lbs` : '—'}</p>
            {curW && prevW && (
              <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {curW.value >= prevW.value ? '+' : ''}
                {fmtNum(curW.value - prevW.value)} since {friendlyDate(prevW.date)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">BMI</p>
            <p className="text-lg font-semibold tabular-nums">{curW ? fmtNum(bmi(curW.value)) : '—'}</p>
          </div>
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void logWeight()
          }}
        >
          <input
            className="field"
            inputMode="decimal"
            placeholder="Today's weight (lbs)"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!(Number(weightInput) > 0)}>
            Log
          </button>
        </form>

        <div className="mt-4">
          <LineChart points={weights} format={(v) => fmtNum(v)} label="Weight" />
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Measurements</h2>
          <button
            type="button"
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
            onClick={() => setUpdateAll(true)}
          >
            Update all
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tap a ring on the model or a row below.</p>

        <div className="mt-3">
          {use3D ? (
            <Suspense fallback={<div className="h-[440px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />}>
              <Body3D
                values={snapshotValues}
                ghostValues={compare && dates.length > 1 ? (atLatest ? firstValues : latestValues) : null}
                selected={selected}
                onSelect={setSelected}
                label={{
                  title: MEASURE_BY_KEY[selected].label,
                  value: snapshot[selected] ? `${fmtNum(snapshot[selected].value, 2)}″` : 'not measured',
                }}
                onFallback={() => setUse3D(false)}
              />
            </Suspense>
          ) : (
            <BodyFigure selected={selected} onSelect={setSelected} latest={snapshot} />
          )}
        </div>

        {dates.length > 1 && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {viewIdx === dates.length - 1 ? 'Latest' : 'As of'} · {friendlyDate(dates[viewIdx])}
              </span>
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-indigo-600" />
                Ghost of {friendlyDate(atLatest ? dates[0] : dates[dates.length - 1])}
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={dates.length - 1}
              step={1}
              value={viewIdx}
              onChange={(e) => setViewIdx(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-600"
              aria-label="Measurement date"
            />
          </div>
        )}
        {!Object.keys(snapshot).some((k) => k !== 'weight') && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            The model uses typical proportions until you add your own measurements, then reshapes to match.
          </p>
        )}

        <div className="mt-3">
          <MeasurementDetail key={selected} metric={selected} rows={all} />
        </div>

        {(['Jacket & shirt', 'Pants'] as const).map((group) => (
          <div key={group} className="mt-4">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{group}</h3>
            <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
              {MEASUREMENTS.filter((m) => m.group === group).map((m) => (
                <li key={m.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.key)}
                    className={`flex w-full items-center justify-between py-2 text-left text-sm ${
                      selected === m.key ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''
                    }`}
                  >
                    <span>{m.label}</span>
                    <span className="tabular-nums">{latest[m.key] ? `${fmtNum(latest[m.key].value, 2)}″` : '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {sizes.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Estimated sizes</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {sizes.map((s) => (
              <li key={s.label} className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                <span className="font-medium tabular-nums">{s.value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Off-the-rack estimates. Brands vary.</p>
        </section>
      )}

      <UpdateAllSheet open={updateAll} onClose={closeUpdateAll} latest={latest} />
    </div>
  )
}
