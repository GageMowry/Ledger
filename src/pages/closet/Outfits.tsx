import { useCallback, useState } from 'react'
import { db, type ClothingItem, type Outfit } from '../../db'
import { CATEGORIES, OCCASIONS } from '../../closet'
import Sheet from '../../components/Sheet'
import ClothingThumb from '../../components/ClothingThumb'

function OutfitBuilder({
  items,
  initial,
  onSave,
  onDelete,
}: {
  items: ClothingItem[]
  initial?: Outfit
  onSave: (o: { name: string; occasion: string; itemIds: number[]; notes: string }) => void | Promise<void>
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [occasion, setOccasion] = useState(initial?.occasion ?? 'Casual')
  const [picked, setPicked] = useState<number[]>(initial?.itemIds ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? '')

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !picked.length) return
        void onSave({ name: name.trim(), occasion, itemIds: picked, notes: notes.trim() })
      }}
    >
      <input className="field" placeholder="Outfit name" aria-label="Outfit name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="grid grid-cols-4 gap-1">
        {OCCASIONS.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={occasion === o}
            onClick={() => setOccasion(o)}
            className={`rounded-lg py-2 text-xs font-medium ${occasion === o ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {o}
          </button>
        ))}
      </div>
      <div>
        <p className="text-sm font-medium">
          Pick items <span className="text-slate-400">{picked.length} selected</span>
        </p>
        {CATEGORIES.map((c) => {
          const group = items.filter((i) => i.category === c.key)
          if (!group.length) return null
          return (
            <div key={c.key} className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{c.label}</p>
              <ul className="mt-1 grid grid-cols-4 gap-2">
                {group.map((i) => {
                  const on = picked.includes(i.id)
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={i.name}
                        onClick={() => setPicked(on ? picked.filter((x) => x !== i.id) : [...picked, i.id])}
                        className={`block w-full overflow-hidden rounded-lg ring-2 ${on ? 'ring-indigo-600' : 'opacity-60 ring-transparent'}`}
                      >
                        <ClothingThumb item={i} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <textarea className="field min-h-16" placeholder="Notes (optional)" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button type="submit" className="btn-primary w-full" disabled={!name.trim() || !picked.length}>
        Save outfit
      </button>
      {onDelete && (
        <div className="border-t border-slate-200 pt-4 text-center dark:border-slate-800">
          <button type="button" onClick={onDelete} className="text-sm text-rose-600 dark:text-rose-400">
            Delete this outfit…
          </button>
        </div>
      )}
    </form>
  )
}

export default function Outfits({ items, outfits }: { items: ClothingItem[]; outfits: Outfit[] }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const close = useCallback(() => {
    setOpenId(null)
    setEditing(false)
  }, [])
  const closeAdd = useCallback(() => setAdding(false), [])
  const byId = new Map(items.map((i) => [i.id, i]))
  const open = outfits.find((o) => o.id === openId) ?? null
  const sorted = [...outfits].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {outfits.length} saved outfit{outfits.length === 1 ? '' : 's'}
        </p>
        <button type="button" className="btn-secondary" disabled={!items.length} onClick={() => setAdding(true)}>
          + Build outfit
        </button>
      </div>

      {sorted.length ? (
        <ul className="space-y-3">
          {sorted.map((o) => {
            const its = o.itemIds.map((id) => byId.get(id)).filter((i): i is ClothingItem => !!i)
            return (
              <li key={o.id}>
                <button type="button" onClick={() => setOpenId(o.id)} className="card block w-full text-left">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      <span className="mr-1 text-amber-500">★</span>
                      {o.name}
                    </p>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{o.occasion}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {its.slice(0, 4).map((i) => (
                      <ClothingThumb key={i.id} item={i} className="rounded-lg" />
                    ))}
                  </div>
                  {its.length > 4 && <p className="mt-1 text-xs text-slate-500">+{its.length - 4} more</p>}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="card py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-200">No saved outfits yet</p>
          <p className="mt-1">Save one from the Maker, or build your own from your items.</p>
        </div>
      )}

      <Sheet open={!!open} onClose={close} title={editing ? 'Edit outfit' : (open?.name ?? '')}>
        {open &&
          (editing ? (
            <OutfitBuilder
              key={open.id}
              items={items}
              initial={open}
              onSave={async (v) => {
                await db.outfits.update(open.id, v)
                setEditing(false)
              }}
              onDelete={async () => {
                if (confirm(`Delete the outfit "${open.name}"? Your clothing items stay in your closet.`)) {
                  await db.outfits.delete(open.id)
                  close()
                }
              }}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{open.occasion}</p>
              <ul className="grid grid-cols-2 gap-3">
                {open.itemIds
                  .map((id) => byId.get(id))
                  .filter((i): i is ClothingItem => !!i)
                  .map((i) => (
                    <li key={i.id}>
                      <ClothingThumb item={i} className="rounded-xl" />
                      <p className="mt-1 truncate text-sm font-medium">{i.name}</p>
                    </li>
                  ))}
              </ul>
              {open.notes && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{open.notes}</p>}
              <button type="button" className="btn-secondary w-full" onClick={() => setEditing(true)}>
                Edit outfit
              </button>
            </div>
          ))}
      </Sheet>

      <Sheet open={adding} onClose={closeAdd} title="Build an outfit">
        <OutfitBuilder
          items={items}
          onSave={async (v) => {
            await db.outfits.add({ ...v, source: 'manual', createdAt: Date.now() } as Outfit)
            setAdding(false)
          }}
        />
      </Sheet>
    </div>
  )
}
