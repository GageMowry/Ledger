import { useEffect, useState } from 'react'
import { useMealsData } from '../useMealsData'
import type { Meal } from '../db'
import SectionRibbon from '../components/SectionRibbon'
import Favorites from './meals/Favorites'
import Staples from './meals/Staples'
import Prefs from './meals/Prefs'
import Maker from './meals/Maker'

type Section = 'favorites' | 'staples' | 'prefs' | 'maker'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'staples', label: 'Staples' },
  { id: 'prefs', label: 'Prefs' },
  { id: 'maker', label: '✦ Maker' },
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
  const [pendingEstimate, setPendingEstimate] = useState<Meal | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(MEALS_SECTION_KEY, section)
    } catch {
      /* storage unavailable */
    }
    window.scrollTo(0, 0)
  }, [section])

  return (
    <div className="-mt-2 space-y-4">
      <SectionRibbon sections={SECTIONS} value={section} onChange={setSection} />

      {data && section === 'favorites' && (
        <Favorites
          data={data}
          onEstimate={(m) => {
            setPendingEstimate(m)
            setSection('maker')
          }}
        />
      )}
      {data && section === 'staples' && <Staples data={data} />}
      {data && section === 'prefs' && <Prefs data={data} />}
      {data && section === 'maker' && (
        <Maker data={data} pendingEstimate={pendingEstimate} onPendingConsumed={() => setPendingEstimate(null)} />
      )}
    </div>
  )
}
