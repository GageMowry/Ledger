import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { hasGeminiKey } from '../closet'
import SectionRibbon from '../components/SectionRibbon'
import Items from './closet/Items'
import Outfits from './closet/Outfits'
import Stylist from './closet/Stylist'

type Section = 'items' | 'outfits' | 'maker'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'outfits', label: 'Outfits' },
  { id: 'maker', label: '✦ Maker' },
]

export const CLOSET_SECTION_KEY = 'ledger.closet.section'

function readSection(): Section {
  try {
    const s = sessionStorage.getItem(CLOSET_SECTION_KEY)
    if (s && SECTIONS.some((x) => x.id === s)) return s as Section
  } catch {
    /* storage unavailable */
  }
  return 'items'
}

export default function Closet() {
  // Three separate live queries: saving an outfit or changing a setting must
  // not re-read every clothing photo.
  const items = useLiveQuery(() => db.clothes.toArray(), [])
  const outfits = useLiveQuery(() => db.outfits.toArray(), [])
  const hasKey = useLiveQuery(hasGeminiKey, [])
  const [section, setSection] = useState<Section>(readSection)
  const [pending, setPending] = useState<{ display: string; prompt: string } | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(CLOSET_SECTION_KEY, section)
    } catch {
      /* storage unavailable */
    }
    window.scrollTo(0, 0)
  }, [section])

  return (
    <div className="-mt-2 space-y-4">
      <SectionRibbon sections={SECTIONS} value={section} onChange={setSection} />

      {items && section === 'items' && (
        <Items
          items={items}
          onBuildFit={(item, occasion) => {
            setPending({
              display: `${occasion} fit around my ${item.name}`,
              prompt: `Build a ${occasion.toLowerCase()} outfit around my "${item.name}" (#${item.id}). It must include item #${item.id}.`,
            })
            setSection('maker')
          }}
        />
      )}
      {items && outfits && section === 'outfits' && <Outfits items={items} outfits={outfits} />}
      {items && hasKey !== undefined && section === 'maker' && (
        <Stylist items={items} hasKey={hasKey} pending={pending} onPendingConsumed={() => setPending(null)} />
      )}
    </div>
  )
}
