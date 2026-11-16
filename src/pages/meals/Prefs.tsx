import { useEffect, useState } from 'react'
import { formatMinutes, savePrefs, saveTargets, saveTimeLimit, type NutritionTargets } from '../../meals'
import type { MealsData } from '../../useMealsData'
import ChipInput from '../../components/ChipInput'

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

const MACRO_FIELDS: { key: keyof Omit<NutritionTargets, 'enabled'>; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'cal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

export default function Prefs({ data }: { data: MealsData }) {
  const { prefs, targets, timeLimit } = data
  const [notes, setNotes] = useState(prefs.notes)
  useEffect(() => setNotes(prefs.notes), [prefs.notes])

  const ingredientSuggestions = [...new Set(data.meals.flatMap((m) => m.ingredients))].sort()

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">Food preferences</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Used for meal suggestions. Type and press return to add.</p>
        </div>
        <div>
          <span className="text-sm font-medium">Love</span>
          <div className="mt-1">
            <ChipInput
              label="Foods you like"
              tone="green"
              values={prefs.likes}
              onChange={(likes) => void savePrefs({ ...prefs, likes })}
              placeholder="e.g. chicken, rice, steak, eggs"
              suggestions={ingredientSuggestions}
            />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium">Dislike</span>
          <div className="mt-1">
            <ChipInput
              label="Foods you dislike"
              tone="amber"
              values={prefs.dislikes}
              onChange={(dislikes) => void savePrefs({ ...prefs, dislikes })}
              placeholder="e.g. mushrooms, olives"
              suggestions={ingredientSuggestions}
            />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium">Never (allergies, restrictions)</span>
          <div className="mt-1">
            <ChipInput
              label="Foods to avoid"
              tone="red"
              values={prefs.avoid}
              onChange={(avoid) => void savePrefs({ ...prefs, avoid })}
              placeholder="e.g. shellfish, pork"
            />
          </div>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Anything else</span>
          <textarea
            className="field mt-1 min-h-16"
            aria-label="Other food notes"
            placeholder="e.g. cutting right now, prefer meal-prep friendly lunches"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== prefs.notes && void savePrefs({ ...prefs, notes })}
          />
        </label>
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Calorie & macro targets</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Shows daily totals on the Log tab.</p>
          </div>
          <Toggle label="Track calories and macros" on={targets.enabled} onChange={(enabled) => void saveTargets({ ...targets, enabled })} />
        </div>
        {targets.enabled && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {MACRO_FIELDS.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="font-medium">{f.label}</span>
                <div className="relative mt-1">
                  <input
                    className="field pr-10"
                    inputMode="numeric"
                    placeholder="—"
                    aria-label={`${f.label} target (${f.unit})`}
                    defaultValue={targets[f.key] ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      void saveTargets({ ...targets, [f.key]: v && Number(v) > 0 ? Number(v) : undefined })
                    }}
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{f.unit}</span>
                </div>
              </label>
            ))}
            <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">Leave any blank to skip it.</p>
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Max cook + prep time</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {timeLimit.enabled ? `Suggestions stay under ${formatMinutes(timeLimit.maxTotalMin)}.` : 'No time limit on suggestions.'}
            </p>
          </div>
          <Toggle label="Limit total time" on={timeLimit.enabled} onChange={(enabled) => void saveTimeLimit({ ...timeLimit, enabled })} />
        </div>
        {timeLimit.enabled && (
          <div className="mt-4">
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={timeLimit.maxTotalMin}
              onChange={(e) => void saveTimeLimit({ ...timeLimit, maxTotalMin: Number(e.target.value) })}
              className="w-full accent-indigo-600"
              aria-label="Maximum total minutes"
            />
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>5 min</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMinutes(timeLimit.maxTotalMin)}</span>
              <span>2 hr</span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
