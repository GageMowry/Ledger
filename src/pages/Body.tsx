import { useEffect, useState } from 'react'
import Overview from './body/Overview'
import Lifts from './body/Lifts'
import Runs from './body/Runs'
import History from './body/History'

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
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
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

      {section === 'overview' && <Overview />}
      {section === 'lifts' && <Lifts />}
      {section === 'runs' && <Runs />}
      {section === 'history' && <History />}
    </div>
  )
}
