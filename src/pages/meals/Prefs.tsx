import { useEffect, useRef, useState } from 'react'
import { addTo, formatMinutes, savePrefs, saveTargets, saveTimeLimit, type FoodPrefs, type NutritionTargets } from '../../meals'
import type { MealsData } from '../../useMealsData'

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

type ListKey = 'likes' | 'dislikes' | 'avoid'

const LISTS: { key: ListKey; title: string; hint?: string; dot: string }[] = [
  { key: 'likes', title: 'Likes', dot: 'bg-emerald-500' },
  { key: 'dislikes', title: 'Dislikes', dot: 'bg-amber-500' },
  { key: 'avoid', title: 'Allergies & never', hint: 'Never used in a recipe', dot: 'bg-rose-500' },
]

export default function Prefs({ data }: { data: MealsData }) {
  const { prefs, targets, timeLimit } = data
  const [text, setText] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [notes, setNotes] = useState(prefs.notes)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => setNotes(prefs.notes), [prefs.notes])
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(t)
  }, [flash])

  const addToList = (key: ListKey, title: string) => {
    const items = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (!items.length) {
      inputRef.current?.focus()
      return
    }
    void savePrefs({ ...prefs, [key]: addTo(prefs[key], items) } as FoodPrefs)
    setFlash(`Added to ${title}: ${items.join(', ')}`)
    setText('')
  }

  return (
    <div className="space-y-6">
      {/* One add line for every list; stays in view while scrolling. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+var(--ribbon-offset,0px))] z-[5] transition-[top] duration-200 -mx-4 bg-white/95 px-4 py-2 backdrop-blur dark:bg-slate-950/95">
        <input
          ref={inputRef}
          className="field"
          placeholder="Type a food, then tap + on a list"
          aria-label="Food to add"
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="done"
        />
        <p className="mt-1 h-4 text-xs text-emerald-600 dark:text-emerald-400" aria-live="polite">
          {flash ?? ''}
        </p>
      </div>

      {LISTS.map((l) => {
        const items = prefs[l.key]
        return (
          <section key={l.key} aria-label={l.title}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 dark:border-slate-800">
              <div>
                <h2 className="font-semibold">
                  {l.title} <span className="text-sm font-normal text-slate-400">{items.length}</span>
                </h2>
                {l.hint && <p className="text-xs text-slate-500 dark:text-slate-400">{l.hint}</p>}
              </div>
              <button
                type="button"
                onClick={() => addToList(l.key, l.title)}
                aria-label={`Add to ${l.title}`}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none font-medium transition ${
                  text.trim()
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                +
              </button>
            </div>
            {items.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {items.map((item) => (
                  <li key={item} className="flex items-center gap-3 py-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${l.dot}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{item}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${item} from ${l.title}`}
                      className="rounded-full px-2.5 py-1 text-slate-400 hover:text-rose-600"
                      onClick={() => void savePrefs({ ...prefs, [l.key]: items.filter((x) => x !== item) } as FoodPrefs)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-slate-400">Nothing yet.</p>
            )}
          </section>
        )
      })}

      <section>
        <h2 className="border-b border-slate-200 pb-2 font-semibold dark:border-slate-800">Other notes</h2>
        <textarea
          className="field mt-3 min-h-20"
          aria-label="Other food notes"
          placeholder="e.g. cutting right now, cooking for one, no oven on weekdays"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== prefs.notes && void savePrefs({ ...prefs, notes })}
        />
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 dark:border-slate-800">
          <div>
            <h2 className="font-semibold">Calorie & macro targets</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Daily goals the Meal Maker plans around</p>
          </div>
          <Toggle label="Use calorie and macro targets" on={targets.enabled} onChange={(enabled) => void saveTargets({ ...targets, enabled })} />
        </div>
        {targets.enabled && (
          <div className="mt-3 grid grid-cols-2 gap-3">
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

      <section>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 dark:border-slate-800">
          <div>
            <h2 className="font-semibold">Max cook + prep time</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {timeLimit.enabled ? `Recipes stay under ${formatMinutes(timeLimit.maxTotalMin)} unless you ask otherwise` : 'No time limit'}
            </p>
          </div>
          <Toggle label="Limit total time" on={timeLimit.enabled} onChange={(enabled) => void saveTimeLimit({ ...timeLimit, enabled })} />
        </div>
        {timeLimit.enabled && (
          <div className="mt-3">
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

      <p className="text-xs text-slate-500 dark:text-slate-400">
        The Meal Maker reads all of this and can add to these lists as you chat. Try “help me build out my preferences.”
      </p>
    </div>
  )
}
