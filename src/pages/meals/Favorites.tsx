import { useCallback, useMemo, useState } from 'react'
import { db, type Meal } from '../../db'
import { formatMinutes, saveMeal, totalMin } from '../../meals'
import type { MealsData } from '../../useMealsData'
import Sheet from '../../components/Sheet'
import RecipeForm from '../../components/RecipeForm'
import RecipeView from '../../components/RecipeView'

function isStaple(line: string, staples: string[]) {
  const l = line.toLowerCase()
  return staples.some((s) => l.includes(s.toLowerCase()))
}

export default function Favorites({ data, onEstimate }: { data: MealsData; onEstimate: (m: Meal) => void }) {
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<Meal | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const closeView = useCallback(() => {
    setViewing(null)
    setEditing(false)
  }, [])
  const closeAdd = useCallback(() => setAdding(false), [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? data.meals.filter((m) => [m.name, ...m.ingredients].some((s) => s.toLowerCase().includes(q))) : data.meals
  }, [data.meals, query])

  // Keep the open recipe in sync with edits.
  const current = viewing ? (data.meals.find((m) => m.id === viewing.id) ?? viewing) : null

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="field"
          type="search"
          placeholder="Search favorites"
          aria-label="Search favorites"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={() => setAdding(true)}>
          + Add
        </button>
      </div>

      <div className="card py-1">
        {list.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((m) => {
              const t = totalMin(m)
              const bits = [
                t !== undefined && formatMinutes(t),
                m.calories !== undefined && `${m.calories} cal`,
                m.protein !== undefined && `${m.protein}g protein`,
              ].filter(Boolean)
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => setViewing(m)} className="flex w-full items-center gap-3 py-3 text-left">
                    <span className="text-amber-500" aria-hidden="true">
                      ★
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{m.name}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {bits.length ? bits.join(' · ') : `${m.ingredients.length} ingredients`}
                        {m.source === 'ai' ? ' · from Meal Maker' : ''}
                      </span>
                    </span>
                    <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {data.meals.length ? (
              'No favorites match.'
            ) : (
              <>
                <p className="font-medium text-slate-700 dark:text-slate-200">No favorite meals yet</p>
                <p className="mt-1">Save recipes from the Meal Maker, or add your own with + Add.</p>
              </>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!current} onClose={closeView} title={editing ? 'Edit recipe' : (current?.name ?? '')}>
        {current &&
          (editing ? (
            <RecipeForm
              key={current.id}
              initial={current}
              submitLabel="Save"
              onSubmit={async (m) => {
                await saveMeal(m, current.id)
                setEditing(false)
              }}
              onDelete={async () => {
                if (confirm(`Remove "${current.name}" from favorites?`)) {
                  await db.meals.delete(current.id)
                  closeView()
                }
              }}
            />
          ) : (
            <div className="space-y-4">
              <RecipeView
                compact
                r={{ ...current, ingredients: current.ingredients.map((text) => ({ text, staple: isStaple(text, data.staples) || undefined })) }}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    closeView()
                    onEstimate(current)
                  }}
                >
                  ✦ {current.calories !== undefined ? 'Re-estimate macros' : 'Estimate macros'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                  Edit recipe
                </button>
              </div>
            </div>
          ))}
      </Sheet>

      <Sheet open={adding} onClose={closeAdd} title="New favorite">
        <RecipeForm
          initial={{ name: query.trim() }}
          submitLabel="Save to favorites"
          onSubmit={async (m) => {
            await saveMeal(m)
            setQuery('')
            setAdding(false)
          }}
        />
      </Sheet>
    </div>
  )
}
