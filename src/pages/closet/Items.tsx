import { useCallback, useMemo, useState } from 'react'
import type { ClothingCategory, ClothingItem } from '../../db'
import { CATEGORIES, CATEGORY_BY_KEY, OCCASIONS, deleteItem, readView, saveItem, writeView } from '../../closet'
import Sheet from '../../components/Sheet'
import ItemForm from '../../components/ItemForm'
import ClothingThumb from '../../components/ClothingThumb'

const CAT_ORDER = Object.fromEntries(CATEGORIES.map((c, i) => [c.key, i])) as Record<ClothingCategory, number>

function Attr({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <dt className="text-[11px] text-slate-500 uppercase dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-medium first-letter:uppercase">{value || '—'}</dd>
    </div>
  )
}

function ItemDetail({ item, onEdit, onBuildFit }: { item: ClothingItem; onEdit: () => void; onBuildFit: (occasion: string) => void }) {
  return (
    <div className="space-y-4">
      <ClothingThumb item={item} className="mx-auto w-full max-w-xs rounded-2xl" />
      <dl className="grid grid-cols-2 gap-2">
        <Attr label="Category" value={CATEGORY_BY_KEY[item.category]?.label} />
        <Attr label="Color" value={item.color} />
        <Attr label="Pattern" value={item.pattern} />
        <Attr label="Fit" value={item.fit} />
      </dl>
      <div>
        <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Description</h4>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
          {item.description || <span className="text-slate-400">No description yet. Tap Edit → ✦ Generate.</span>}
        </p>
      </div>
      <div>
        <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">✦ Build a fit around this</h4>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {OCCASIONS.map((o) => (
            <button key={o} type="button" className="btn-secondary" onClick={() => onBuildFit(o)}>
              {o}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn-primary w-full" onClick={onEdit}>
        Edit or generate description
      </button>
    </div>
  )
}

export default function Items({
  items,
  onBuildFit,
}: {
  items: ClothingItem[]
  onBuildFit: (item: ClothingItem, occasion: string) => void
}) {
  const [view, setView] = useState(readView)
  const [cat, setCat] = useState<ClothingCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const close = useCallback(() => {
    setOpenId(null)
    setEditing(false)
  }, [])
  const closeAdd = useCallback(() => setAdding(false), [])

  const open = items.find((i) => i.id === openId) ?? null

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((i) => cat === 'all' || i.category === cat)
      .filter((i) => !q || [i.name, i.color, i.pattern, i.fit, i.description].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => CAT_ORDER[a.category] - CAT_ORDER[b.category] || a.name.localeCompare(b.name))
  }, [items, cat, query])

  const counts = useMemo(() => {
    const c: Partial<Record<ClothingCategory, number>> = {}
    for (const i of items) c[i.category] = (c[i.category] ?? 0) + 1
    return c
  }, [items])

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
      active
        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
        : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
    }`

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="field"
          type="search"
          placeholder="Search your closet"
          aria-label="Search your closet"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex shrink-0 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800" role="group" aria-label="View">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={v === 'grid' ? 'Tile view' : 'List view'}
              onClick={() => {
                setView(v)
                writeView(v)
              }}
              className={`rounded-lg px-2.5 ${view === v ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}
            >
              {v === 'grid' ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="8" height="8" rx="2" />
                  <rect x="13" y="3" width="8" height="8" rx="2" />
                  <rect x="3" y="13" width="8" height="8" rx="2" />
                  <rect x="13" y="13" width="8" height="8" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="4" width="5" height="5" rx="1.5" />
                  <rect x="10" y="5.5" width="11" height="2" rx="1" />
                  <rect x="3" y="15" width="5" height="5" rx="1.5" />
                  <rect x="10" y="16.5" width="11" height="2" rx="1" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary shrink-0 px-3" onClick={() => setAdding(true)} aria-label="Add item">
          +
        </button>
      </div>

      <div className="chip-row">
        <button type="button" className={chip(cat === 'all')} onClick={() => setCat('all')}>
          All · {items.length}
        </button>
        {CATEGORIES.filter((c) => counts[c.key]).map((c) => (
          <button key={c.key} type="button" className={chip(cat === c.key)} onClick={() => setCat(c.key)}>
            {c.label} · {counts[c.key]}
          </button>
        ))}
      </div>

      {!list.length ? (
        <div className="card py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {items.length ? (
            'Nothing matches.'
          ) : (
            <>
              <p className="font-medium text-slate-700 dark:text-slate-200">Your closet is empty</p>
              <p className="mt-1">Tap + to add an item, or use the camera button in the Maker to add everything you're wearing from one photo.</p>
            </>
          )}
        </div>
      ) : view === 'grid' ? (
        <ul className="grid grid-cols-2 gap-3">
          {list.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setOpenId(i.id)}
                className="block w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
              >
                <ClothingThumb item={i} />
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="truncate text-xs text-slate-500 first-letter:uppercase dark:text-slate-400">
                    {[i.color, i.fit].filter(Boolean).join(' · ') || CATEGORY_BY_KEY[i.category].label}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="card divide-y divide-slate-100 py-1 dark:divide-slate-800">
          {list.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => setOpenId(i.id)} className="flex w-full items-center gap-3 py-2 text-left">
                <ClothingThumb item={i} className="w-12 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.name}</span>
                  <span className="block truncate text-xs text-slate-500 first-letter:uppercase dark:text-slate-400">
                    {[CATEGORY_BY_KEY[i.category].label, i.color, i.pattern, i.fit].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!open} onClose={close} title={editing ? 'Edit item' : (open?.name ?? '')}>
        {open &&
          (editing ? (
            <ItemForm
              key={open.id}
              initial={open}
              submitLabel="Save"
              onSubmit={async (v) => {
                await saveItem(v, open.id)
                setEditing(false)
              }}
              onDelete={async () => {
                if (confirm(`Delete "${open.name}" from your closet? This also removes it from saved outfits and can't be undone.`)) {
                  await deleteItem(open.id)
                  close()
                }
              }}
            />
          ) : (
            <ItemDetail
              item={open}
              onEdit={() => setEditing(true)}
              onBuildFit={(o) => {
                close()
                onBuildFit(open, o)
              }}
            />
          ))}
      </Sheet>

      <Sheet open={adding} onClose={closeAdd} title="Add item">
        <ItemForm
          initial={{ category: cat === 'all' ? 'top' : cat }}
          autoGenerate
          submitLabel="Add to closet"
          onSubmit={async (v) => {
            await saveItem(v)
            setAdding(false)
          }}
        />
      </Sheet>
    </div>
  )
}
