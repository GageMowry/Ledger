import { useState } from 'react'
import type { Meal, MealSlot } from '../db'
import { SLOTS, formatMinutes, type MealInput } from '../meals'
import ChipInput from './ChipInput'

const num = (s: string) => (s.trim() === '' || !(Number(s) >= 0) ? undefined : Number(s))
const str = (n?: number) => (n === undefined ? '' : String(n))

export default function MealForm({
  initial,
  tagSuggestions,
  showMacros,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  initial?: Partial<Meal>
  tagSuggestions: string[]
  showMacros: boolean
  submitLabel: string
  onSubmit: (m: MealInput) => void | Promise<void>
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slots, setSlots] = useState<MealSlot[]>(initial?.slots ?? [])
  const [prep, setPrep] = useState(str(initial?.prepMin))
  const [cook, setCook] = useState(str(initial?.cookMin))
  const [cal, setCal] = useState(str(initial?.calories))
  const [protein, setProtein] = useState(str(initial?.protein))
  const [carbs, setCarbs] = useState(str(initial?.carbs))
  const [fat, setFat] = useState(str(initial?.fat))
  const [ingredients, setIngredients] = useState<string[]>(initial?.ingredients ?? [])
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [favorite, setFavorite] = useState(initial?.favorite ?? false)
  const [macrosOpen, setMacrosOpen] = useState(showMacros || initial?.calories !== undefined)

  const total = (num(prep) ?? 0) + (num(cook) ?? 0)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        void onSubmit({
          name,
          slots,
          prepMin: num(prep),
          cookMin: num(cook),
          calories: num(cal),
          protein: num(protein),
          carbs: num(carbs),
          fat: num(fat),
          ingredients,
          tags,
          notes,
          favorite,
        })
      }}
    >
      <div className="flex gap-2">
        <input
          className="field"
          placeholder="Meal name, e.g. Chicken burrito bowl"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!initial?.name}
          required
          aria-label="Meal name"
        />
        <button
          type="button"
          onClick={() => setFavorite(!favorite)}
          aria-pressed={favorite}
          aria-label={favorite ? 'Remove from favorites' : 'Mark as favorite'}
          className={`btn-secondary shrink-0 px-3 text-lg ${favorite ? 'text-amber-500' : 'text-slate-400'}`}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>

      <div>
        <span className="text-sm font-medium">Good for</span>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {SLOTS.map((s) => {
            const on = slots.includes(s.key)
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSlots(on ? slots.filter((x) => x !== s.key) : [...slots, s.key])}
                className={`rounded-lg py-2 text-sm font-medium ${
                  on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="font-medium">Prep (min)</span>
          <input className="field mt-1" inputMode="numeric" aria-label="Prep minutes" value={prep} onChange={(e) => setPrep(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="font-medium">Cook (min)</span>
          <input className="field mt-1" inputMode="numeric" aria-label="Cook minutes" value={cook} onChange={(e) => setCook(e.target.value)} />
        </label>
        <div className="text-sm">
          <span className="font-medium">Total</span>
          <p className="mt-1 py-2.5 text-slate-600 tabular-nums dark:text-slate-300">{total ? formatMinutes(total) : '—'}</p>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setMacrosOpen(!macrosOpen)}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
          aria-expanded={macrosOpen}
        >
          {macrosOpen ? '− Nutrition per serving' : '+ Nutrition per serving (optional)'}
        </button>
        {macrosOpen && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {(
              [
                ['Calories', cal, setCal],
                ['Protein g', protein, setProtein],
                ['Carbs g', carbs, setCarbs],
                ['Fat g', fat, setFat],
              ] as const
            ).map(([label, v, set]) => (
              <label key={label} className="text-xs">
                <span className="font-medium">{label}</span>
                <input className="field mt-1 px-2" inputMode="decimal" aria-label={label} value={v} onChange={(e) => set(e.target.value)} />
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="text-sm font-medium">Ingredients</span>
        <div className="mt-1">
          <ChipInput label="Ingredients" values={ingredients} onChange={setIngredients} placeholder="Add an ingredient, press return" />
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">Tags</span>
        <div className="mt-1">
          <ChipInput
            label="Tags"
            values={tags}
            onChange={setTags}
            placeholder="e.g. high protein, mexican, meal prep"
            suggestions={tagSuggestions}
          />
        </div>
      </div>

      <textarea
        className="field min-h-16"
        placeholder="Notes or recipe link (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Notes"
      />

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
