import { useEffect, useState } from 'react'
import { useMealsData } from '../useMealsData'
import Day from './meals/Day'
import Library from './meals/Library'
import Prefs from './meals/Prefs'

type Section = 'log' | 'library' | 'prefs'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'library', label: 'Library' },
  { id: 'prefs', label: 'Preferences' },
]

const STORE_KEY = 'ledger.meals.section'

function readSection(): Section {
  try {
    const s = sessionStorage.getItem(STORE_KEY)
    if (s && SECTIONS.some((x) => x.id === s)) return s as Section
  } catch {
    /* storage unavailable */
  }
  return 'log'
}

export default function Meals() {
  const data = useMealsData()
  const [section, setSection] = useState<Section>(readSection)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, section)
    } catch {
      /* storage unavailable */
    }
    window.scrollTo(0, 0)
  }, [section])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`rounded-lg py-1.5 text-sm font-medium ${
              section === s.id ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {data && section === 'log' && <Day data={data} />}
      {data && section === 'library' && <Library data={data} />}
      {data && section === 'prefs' && <Prefs data={data} />}
    </div>
  )
}
