import { useEffect, useState } from 'react'
import { useMealsData } from '../useMealsData'
import Favorites from './meals/Favorites'
import Staples from './meals/Staples'
import Prefs from './meals/Prefs'
import Maker from './meals/Maker'

type Section = 'favorites' | 'staples' | 'prefs' | 'maker'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'staples', label: 'Staples' },
  { id: 'prefs', label: 'Prefs' },
  { id: 'maker', label: 'Maker' },
]

export const MEALS_SECTION_KEY = 'ledger.meals.section'

function readSection(): Section {
  try {
    const s = sessionStorage.getItem(MEALS_SECTION_KEY)
    if (s && SECTIONS.some((x) => x.id === s)) return s as Section
  } catch {
    /* storage unavailable */
  }
  return 'favorites'
}

export default function Meals() {
  const data = useMealsData()
  const [section, setSection] = useState<Section>(readSection)

  useEffect(() => {
    try {
      sessionStorage.setItem(MEALS_SECTION_KEY, section)
    } catch {
      /* storage unavailable */
    }
    window.scrollTo(0, 0)
  }, [section])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            aria-pressed={section === s.id}
            className={`rounded-lg py-1.5 text-sm font-medium ${
              section === s.id ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {s.id === 'maker' ? '✦ ' : ''}
            {s.label}
          </button>
        ))}
      </div>

      {data && section === 'favorites' && <Favorites data={data} />}
      {data && section === 'staples' && <Staples data={data} />}
      {data && section === 'prefs' && <Prefs data={data} />}
      {data && section === 'maker' && <Maker data={data} />}
    </div>
  )
}
