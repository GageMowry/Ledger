import { useEffect, useState } from 'react'
import Overview from './body/Overview'
import Lifts from './body/Lifts'
import Runs from './body/Runs'
import History from './body/History'
import SectionRibbon from '../components/SectionRibbon'

type Section = 'overview' | 'lifts' | 'runs' | 'history'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Body' },
  { id: 'lifts', label: 'Lifts' },
  { id: 'runs', label: 'Runs' },
  { id: 'history', label: 'History' },
]

const STORE_KEY = 'ledger.body.section'

function readSection(): Section {
  try {
    const s = sessionStorage.getItem(STORE_KEY)
    if (s && SECTIONS.some((x) => x.id === s)) return s as Section
  } catch {
    /* storage unavailable */
  }
  return 'overview'
}

export default function Body() {
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
    <div className="-mt-2 space-y-4">
      <SectionRibbon sections={SECTIONS} value={section} onChange={setSection} />

      {section === 'overview' && <Overview />}
      {section === 'lifts' && <Lifts />}
      {section === 'runs' && <Runs />}
      {section === 'history' && <History />}
    </div>
  )
}
