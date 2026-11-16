import { useState } from 'react'
import type { Meal } from '../db'
import { formatMinutes, type MealInput } from '../meals'

const num = (s: string) => (s.trim() === '' || !(Number(s) >= 0) ? undefined : Number(s))
const str = (n?: number) => (n === undefined ? '' : String(n))
const lines = (s: string) => s.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean)

/** Manual add/edit for a favorite recipe. Ingredients and steps are one per line. */
export default function RecipeForm({
  initial,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  initial?: Partial<Meal>
  submitLabel: string
  onSubmit: (m: MealInput) => void | Promise<void>
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [servings, setServings] = useState(str(initial?.servings))
  const [prep, setPrep] = useState(str(initial?.prepMin))
  const [cook, setCook] = useState(str(initial?.cookMin))
  const [cal, setCal] = useState(str(initial?.calories))
  const [protein, setProtein] = useState(str(initial?.protein))
  const [carbs, setCarbs] = useState(str(initial?.carbs))
  const [fat, setFat] = useState(str(initial?.fat))
  const [ingredients, setIngredients] = useState((initial?.ingredients ?? []).join('\n'))
  const [steps, setSteps] = useState((initial?.steps ?? []).join('\n'))
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const total = (num(prep) ?? 0) + (num(cook) ?? 0)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        void onSubmit({
          name,
          servings: num(servings),
          prepMin: num(prep),
          cookMin: num(cook),
          calories: num(cal),
          protein: num(protein),
          carbs: num(carbs),
          fat: num(fat),
          ingredients: lines(ingredients),
          steps: lines(steps),
          notes,
          source: initial?.source ?? 'manual',
        })
      }}
    >
      <input
        className="field"
        placeholder="Recipe name"
        aria-label="Recipe name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={!initial?.name}
        required
      />

      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ['Prep min', prep, setPrep],
            ['Cook min', cook, setCook],
            ['Serves', servings, setServings],
          ] as const
        ).map(([label, v, set]) => (
          <label key={label} className="text-xs">
            <span className="font-medium">{label}</span>
            <input className="field mt-1 px-2" inputMode="numeric" aria-label={label} value={v} onChange={(e) => set(e.target.value)} />
          </label>
        ))}
        <div className="text-xs">
          <span className="font-medium">Total</span>
          <p className="mt-1 py-2.5 text-sm text-slate-600 tabular-nums dark:text-slate-300">{total ? formatMinutes(total) : '—'}</p>
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">Per serving (optional)</span>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {(
            [
              ['Calories', cal, setCal],
              ['Protein g', protein, setProtein],
              ['Carbs g', carbs, setCarbs],
              ['Fat g', fat, setFat],
            ] as const
          ).map(([label, v, set]) => (
            <label key={label} className="text-xs">
              <span>{label}</span>
              <input className="field mt-1 px-2" inputMode="decimal" aria-label={label} value={v} onChange={(e) => set(e.target.value)} />
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Ingredients</span>
        <span className="ml-1 text-xs text-slate-500">one per line</span>
        <textarea
          className="field mt-1 min-h-28"
          placeholder={'1 lb chicken thighs\n1 cup rice\n2 tbsp soy sauce'}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Steps</span>
        <span className="ml-1 text-xs text-slate-500">one per line</span>
        <textarea
          className="field mt-1 min-h-32"
          placeholder={'Cook the rice.\nSear the chicken 5 min per side.\nToss with the sauce.'}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
      </label>

      <textarea className="field min-h-16" placeholder="Notes (optional)" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary flex-1" disabled={!name.trim()}>
          {submitLabel}
        </button>
        {onDelete && (
          <button type="button" className="btn bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
