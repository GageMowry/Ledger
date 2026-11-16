import { formatMinutes } from '../meals'

export interface RecipeLike {
  name: string
  servings?: number
  prepMin?: number
  cookMin?: number
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  ingredients: { text: string; staple?: boolean }[]
  steps: string[]
  notes?: string
}

/** Read-only recipe layout used by Favorites and the Meal Maker. */
export default function RecipeView({ r, compact = false }: { r: RecipeLike; compact?: boolean }) {
  const total = (r.prepMin ?? 0) + (r.cookMin ?? 0)
  const facts: { label: string; value: string }[] = []
  if (r.prepMin !== undefined) facts.push({ label: 'Prep', value: formatMinutes(r.prepMin) })
  if (r.cookMin !== undefined) facts.push({ label: 'Cook', value: formatMinutes(r.cookMin) })
  if (total && r.prepMin !== undefined && r.cookMin !== undefined) facts.push({ label: 'Total', value: formatMinutes(total) })
  if (r.servings) facts.push({ label: 'Serves', value: String(r.servings) })

  const macros = [
    r.calories !== undefined && `${r.calories} cal`,
    r.protein !== undefined && `${r.protein}g protein`,
    r.carbs !== undefined && `${r.carbs}g carbs`,
    r.fat !== undefined && `${r.fat}g fat`,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-4">
      {!compact && <h3 className="text-lg font-semibold">{r.name}</h3>}

      {facts.length > 0 && (
        <dl className="grid grid-cols-4 gap-2 text-center">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
              <dt className="text-[11px] text-slate-500 uppercase dark:text-slate-400">{f.label}</dt>
              <dd className="text-sm font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {macros.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-medium">Per serving:</span> {macros.join(' · ')}
        </p>
      )}

      <div>
        <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Ingredients</h4>
        <ul className="mt-2 space-y-1.5">
          {r.ingredients.map((ing, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ing.staple ? 'bg-emerald-500' : 'bg-slate-400'}`}
                aria-hidden="true"
              />
              <span>
                {ing.text}
                {ing.staple === false && <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">need to buy</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Steps</h4>
        <ol className="mt-2 space-y-2">
          {r.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {r.notes && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{r.notes}</p>}
    </div>
  )
}
