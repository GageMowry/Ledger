import { useCallback, useMemo, useState } from 'react'
import { db, type MealSlot } from '../../db'
import { addDays, friendlyDate, todayISO } from '../../dates'
import { SLOTS, dayTotals, fitsTime, logMeal, saveMeal, type Macros } from '../../meals'
import type { MealsData } from '../../useMealsData'
import Sheet from '../../components/Sheet'
import MealForm from '../../components/MealForm'
import { MealSummary } from './Library'

const MACROS: { key: keyof Macros; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

function Totals({ totals, data }: { totals: ReturnType<typeof dayTotals>; data: MealsData }) {
  const t = data.targets
  const rows = MACROS.filter((m) => t[m.key] !== undefined)
  if (!rows.length) return null
  return (
    <section className="card space-y-3">
      {rows.map((m) => {
        const goal = t[m.key]!
        const v = Math.round(totals[m.key])
        const pct = Math.min(100, (v / goal) * 100)
        const over = v > goal
        return (
          <div key={m.key}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{m.label}</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                {v.toLocaleString()} / {goal.toLocaleString()}
                {m.unit}
                <span className="ml-1 text-xs text-slate-400">
                  {over ? `${(v - goal).toLocaleString()}${m.unit} over` : `${(goal - v).toLocaleString()}${m.unit} left`}
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${over ? 'bg-amber-500' : 'bg-indigo-600 dark:bg-indigo-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
      {totals.missing > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {totals.missing} logged meal{totals.missing === 1 ? ' has' : 's have'} no nutrition info, so totals may be low.
        </p>
      )}
    </section>
  )
}

function Picker({ slot, date, data, onDone }: { slot: MealSlot; date: string; data: MealsData; onDone: () => void }) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inSlot = (id: number) => data.stats.get(id)?.bySlot[slot] ?? 0
    const total = (id: number) => data.stats.get(id)?.count ?? 0
    return data.meals
      .filter((m) => !q || [m.name, ...m.tags, ...m.ingredients].some((s) => s.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          Number(b.slots.includes(slot)) - Number(a.slots.includes(slot)) ||
          inSlot(b.id) - inSlot(a.id) ||
          Number(b.favorite) - Number(a.favorite) ||
          total(b.id) - total(a.id) ||
          a.name.localeCompare(b.name),
      )
  }, [data, query, slot])

  if (creating) {
    return (
      <MealForm
        initial={{ name: query.trim(), slots: [slot] }}
        tagSuggestions={data.tags}
        showMacros={data.targets.enabled}
        submitLabel="Add & log"
        onSubmit={async (input) => {
          const id = await saveMeal(input)
          const meal = await db.meals.get(id)
          if (meal) await logMeal(meal, date, slot)
          onDone()
        }}
      />
    )
  }

  return (
    <div className="space-y-3">
      <input
        className="field"
        type="search"
        placeholder="Search your meals"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search your meals"
        autoFocus
      />
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 py-3 text-left"
              onClick={async () => {
                await logMeal(m, date, slot)
                onDone()
              }}
            >
              <span className="min-w-0">
                <MealSummary meal={m} data={data} />
              </span>
              {!fitsTime(m, data.timeLimit) && (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  Long
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {!list.length && (
        <p className="py-2 text-center text-sm text-slate-500 dark:text-slate-400">
          {data.meals.length ? 'No meals match.' : 'No meals in your library yet.'}
        </p>
      )}
      <button type="button" className="btn-secondary w-full" onClick={() => setCreating(true)}>
        + New meal{query.trim() ? ` “${query.trim()}”` : ''}
      </button>
    </div>
  )
}

export default function Day({ data }: { data: MealsData }) {
  const [date, setDate] = useState(todayISO())
  const [picking, setPicking] = useState<MealSlot | null>(null)
  const closePicker = useCallback(() => setPicking(null), [])

  const dayLogs = useMemo(
    () => data.logs.filter((l) => l.date === date).sort((a, b) => a.createdAt - b.createdAt),
    [data.logs, date],
  )
  const totals = dayTotals(dayLogs, data.byId)
  const isToday = date === todayISO()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" className="btn-secondary px-3" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <div className="text-center">
          <p className="font-semibold">{friendlyDate(date)}</p>
          {!isToday && (
            <button type="button" className="text-xs font-medium text-indigo-600 dark:text-indigo-400" onClick={() => setDate(todayISO())}>
              Back to today
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary px-3"
          onClick={() => setDate(addDays(date, 1))}
          disabled={isToday}
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {data.targets.enabled && <Totals totals={totals} data={data} />}

      {SLOTS.map((s) => {
        const items = dayLogs.filter((l) => l.slot === s.key)
        return (
          <section key={s.key} className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{s.label}</h2>
              <button
                type="button"
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
                onClick={() => setPicking(s.key)}
              >
                + Log
              </button>
            </div>
            {items.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((l) => {
                  const m = data.byId.get(l.mealId)
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{l.name}</span>
                        {m?.calories !== undefined && (
                          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                            {Math.round(m.calories * l.servings)} cal
                            {m.protein !== undefined ? ` · ${Math.round(m.protein * l.servings)}g protein` : ''}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <select
                          className="rounded-lg bg-slate-100 px-1.5 py-1 text-xs dark:bg-slate-800"
                          value={l.servings}
                          onChange={(e) => void db.mealLogs.update(l.id, { servings: Number(e.target.value) })}
                          aria-label={`Servings of ${l.name}`}
                        >
                          {[0.5, 1, 1.5, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              {n}×
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-slate-400 hover:text-rose-600"
                          aria-label={`Remove ${l.name}`}
                          onClick={() => void db.mealLogs.delete(l.id)}
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      <Sheet open={!!picking} onClose={closePicker} title={`Log ${SLOTS.find((s) => s.key === picking)?.label.toLowerCase() ?? ''} · ${friendlyDate(date)}`}>
        {picking && <Picker key={`${picking}${date}`} slot={picking} date={date} data={data} onDone={closePicker} />}
      </Sheet>
    </div>
  )
}
