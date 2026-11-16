import { useCallback, useMemo, useState } from 'react'
import { db, type Meal, type MealSlot } from '../../db'
import { friendlyDate } from '../../dates'
import { SLOTS, fitsTime, formatMinutes, saveMeal, totalMin } from '../../meals'
import type { MealsData } from '../../useMealsData'
import Sheet from '../../components/Sheet'
import MealForm from '../../components/MealForm'

type Sort = 'most' | 'recent' | 'quickest' | 'az'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'most', label: 'Most eaten' },
  { id: 'recent', label: 'Recent' },
  { id: 'quickest', label: 'Quickest' },
  { id: 'az', label: 'Aâ€“Z' },
]

export function MealSummary({ meal, data }: { meal: Meal; data: MealsData }) {
  const t = totalMin(meal)
  const s = data.stats.get(meal.id)
  const bits: string[] = []
  if (t !== undefined) bits.push(formatMinutes(t))
  if (meal.calories !== undefined) bits.push(`${meal.calories} cal`)
  if (meal.protein !== undefined) bits.push(`${meal.protein}g protein`)
  return (
    <>
      <p className="font-medium">
        {meal.favorite && <span className="mr-1 text-amber-500">â˜…</span>}
        {meal.name}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {bits.join(' Â· ')}
        {bits.length > 0 && s ? ' Â· ' : ''}
        {s ? `eaten ${s.count}Ã— Â· last ${friendlyDate(s.lastDate!)}` : bits.length ? '' : 'Not eaten yet'}
      </p>
    </>
  )
}

export default function Library({ data }: { data: MealsData }) {
  const [query, setQuery] = useState('')
  const [slot, setSlot] = useState<MealSlot | 'all' | 'fav'>('all')
  const [onlyFits, setOnlyFits] = useState(false)
  const [sort, setSort] = useState<Sort>('most')
  const [editing, setEditing] = useState<Meal | null>(null)
  const [adding, setAdding] = useState(false)
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeAdd = useCallback(() => setAdding(false), [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = data.meals.filter((m) => {
      if (slot === 'fav' && !m.favorite) return false
      if (slot !== 'all' && slot !== 'fav' && !m.slots.includes(slot)) return false
      if (onlyFits && !fitsTime(m, data.timeLimit)) return false
      if (!q) return true
      return [m.name, ...m.tags, ...m.ingredients].some((s) => s.toLowerCase().includes(q))
    })
    const count = (m: Meal) => data.stats.get(m.id)?.count ?? 0
    const last = (m: Meal) => data.stats.get(m.id)?.lastDate ?? ''
    return out.sort((a, b) => {
      switch (sort) {
        case 'most':
          return count(b) - count(a) || a.name.localeCompare(b.name)
        case 'recent':
          return last(b).localeCompare(last(a)) || b.createdAt - a.createdAt
        case 'quickest':
          return (totalMin(a) ?? 9999) - (totalMin(b) ?? 9999)
        case 'az':
          return a.name.localeCompare(b.name)
      }
    })
  }, [data, query, slot, onlyFits, sort])

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
      active
        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
        : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
    }`

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="field"
          type="search"
          placeholder="Search meals, tags, ingredients"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search meals"
        />
        <button type="button" className="btn-primary shrink-0" onClick={() => setAdding(true)}>
          + Meal
        </button>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" className={chip(slot === 'all')} onClick={() => setSlot('all')}>
          All Â· {data.meals.length}
        </button>
        <button type="button" className={chip(slot === 'fav')} onClick={() => setSlot('fav')}>
          â˜… Favorites
        </button>
        {SLOTS.map((s) => (
          <button key={s.key} type="button" className={chip(slot === s.key)} onClick={() => setSlot(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <select
          className="rounded-lg bg-transparent py-1 font-medium text-slate-600 dark:text-slate-300"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort meals"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        {data.timeLimit.enabled && (
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} className="accent-indigo-600" />
            Under {formatMinutes(data.timeLimit.maxTotalMin)}
          </label>
        )}
      </div>

      <div className="card py-1">
        {list.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setEditing(m)} className="block w-full py-3 text-left">
                  <MealSummary meal={m} data={data} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {data.meals.length ? (
              'No meals match.'
            ) : (
              <>
                <p>Your meal library is empty.</p>
                <p className="mt-1">Add the meals you eat most. Name and time are enough to start.</p>
              </>
            )}
          </div>
        )}
      </div>

      <Sheet open={adding} onClose={closeAdd} title="New meal">
        <MealForm
          initial={{ name: query.trim(), slots: slot !== 'all' && slot !== 'fav' ? [slot] : [] }}
          tagSuggestions={data.tags}
          showMacros={data.targets.enabled}
          submitLabel="Add meal"
          onSubmit={async (m) => {
            await saveMeal(m)
            setQuery('')
            setAdding(false)
          }}
        />
      </Sheet>

      <Sheet open={!!editing} onClose={closeEdit} title="Edit meal">
        {editing && (
          <MealForm
            key={editing.id}
            initial={editing}
            tagSuggestions={data.tags}
            showMacros={data.targets.enabled}
            submitLabel="Save"
            onSubmit={async (m) => {
              await saveMeal(m, editing.id)
              setEditing(null)
            }}
            onDelete={async () => {
              const n = data.stats.get(editing.id)?.count ?? 0
              if (confirm(`Delete "${editing.name}"?${n ? ` Its ${n} log entr${n === 1 ? 'y stays' : 'ies stay'} in your history.` : ''}`)) {
                await db.meals.delete(editing.id)
                setEditing(null)
              }
            }}
          />
        )}
      </Sheet>
    </div>
  )
}
