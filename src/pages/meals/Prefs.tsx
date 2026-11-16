import { useEffect, useState } from 'react'
import { formatMinutes, savePrefs, saveTargets, saveTimeLimit, type NutritionTargets } from '../../meals'
import type { MealsData } from '../../useMealsData'
import EditableList from '../../components/EditableList'

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

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        The Meal Maker reads all of this, and can add to these lists as you chat. Try “help me build out my preferences.”
      </p>

      <EditableList
        title="Likes"
        items={prefs.likes}
        onChange={(likes) => void savePrefs({ ...prefs, likes })}
        placeholder="e.g. steak, spicy food, Mexican"
        emptyText="Nothing yet."
        tone="green"
        maxHeight="max-h-48"
      />
      <EditableList
        title="Dislikes"
        items={prefs.dislikes}
        onChange={(dislikes) => void savePrefs({ ...prefs, dislikes })}
        placeholder="e.g. mushrooms, olives"
        emptyText="Nothing yet."
        tone="amber"
        maxHeight="max-h-48"
      />
      <EditableList
        title="Allergies & never"
        description="Never used in a recipe."
        items={prefs.avoid}
        onChange={(avoid) => void savePrefs({ ...prefs, avoid })}
        placeholder="e.g. shellfish, peanuts"
        emptyText="Nothing yet."
        tone="red"
        maxHeight="max-h-48"
      />

      <section className="card">
        <h2 className="font-semibold">Other notes</h2>
        <textarea
          className="field mt-2 min-h-20"
          aria-label="Other food notes"
          placeholder="e.g. cutting right now, cooking for one, no oven on weekdays"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== prefs.notes && void savePrefs({ ...prefs, notes })}
        />
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Calorie & macro targets</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Daily goals the Meal Maker plans recipes around.</p>
          </div>
          <Toggle label="Use calorie and macro targets" on={targets.enabled} onChange={(enabled) => void saveTargets({ ...targets, enabled })} />
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
            <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">Per day. Leave any blank to skip it.</p>
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Max cook + prep time</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {timeLimit.enabled ? `Recipes stay under ${formatMinutes(timeLimit.maxTotalMin)} unless you ask otherwise.` : 'No time limit.'}
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
