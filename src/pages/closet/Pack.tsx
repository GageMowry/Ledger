import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ClothingItem, type PackLine, type Trip } from '../../db'
import { CATEGORIES, OCCASIONS } from '../../closet'
import { todayISO } from '../../dates'
import { warmUp } from '../../gemini'
import { adjustTrip, editLines, packedCount, planTrip, tripDates, type TripInput } from '../../packing'
import Sheet from '../../components/Sheet'
import ClothingThumb from '../../components/ClothingThumb'
import { Sources, WebToggle } from '../../components/WebSearch'

// ---------------------------------------------------------------- new trip form

function NewTrip({ items, hasKey, onCreated }: { items: ClothingItem[]; hasKey: boolean; onCreated: (id: number) => void }) {
  const [place, setPlace] = useState('')
  const [startDate, setStartDate] = useState('')
  const [nights, setNights] = useState(3)
  const [occasions, setOccasions] = useState<string[]>(['Casual'])
  const [plans, setPlans] = useState('')
  const [weather, setWeather] = useState('')
  const [search, setSearch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const input = (): TripInput => ({
    place: place.trim(),
    startDate: startDate || undefined,
    nights,
    occasions,
    plans: plans.trim() || undefined,
    weather: weather.trim() || undefined,
  })

  async function make() {
    if (!place.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      onCreated(await planTrip(input(), { search, items }))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function makeEmpty() {
    if (!place.trim()) return
    const now = Date.now()
    const trip: Omit<Trip, 'id'> = { ...input(), lines: [], createdAt: now, updatedAt: now }
    onCreated((await db.trips.add(trip as Trip)) as number)
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void (hasKey ? make() : makeEmpty())
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Where to?</span>
          <input
            className="field mt-1"
            placeholder="e.g. Chicago, a lake cabin, Denver for work"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            onFocus={hasKey ? warmUp : undefined}
            required
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="block min-w-[9rem] flex-1">
            <span className="text-sm font-medium">Leaving</span>
            <input type="date" className="field mt-1" value={startDate} min={todayISO()} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <div className="min-w-[9rem] flex-1">
            <span className="text-sm font-medium" id="nights-label">
              Nights
            </span>
            <div className="mt-1 flex items-center gap-2" role="group" aria-labelledby="nights-label">
              <button type="button" className="btn-secondary h-[46px] w-[46px] shrink-0 px-0 text-lg" aria-label="One fewer night" onClick={() => setNights(Math.max(1, nights - 1))}>
                −
              </button>
              <span className="min-w-0 flex-1 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                {nights}
              </span>
              <button type="button" className="btn-secondary h-[46px] w-[46px] shrink-0 px-0 text-lg" aria-label="One more night" onClick={() => setNights(Math.min(30, nights + 1))}>
                +
              </button>
            </div>
          </div>
        </div>

        <div>
          <span className="text-sm font-medium">What you'll be doing</span>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {OCCASIONS.map((o) => {
              const on = occasions.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setOccasions(on ? occasions.filter((x) => x !== o) : [...occasions, o])}
                  className={`rounded-lg py-2 text-xs font-medium ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                >
                  {o}
                </button>
              )
            })}
          </div>
          <input
            className="field mt-2"
            placeholder="Anything specific? Wedding Sat, hiking, beach…"
            aria-label="Specific plans"
            value={plans}
            onChange={(e) => setPlans(e.target.value)}
          />
        </div>

        <label className="block">
          <span className="text-sm font-medium">Weather</span>
          <input
            className="field mt-1"
            placeholder={search ? 'Will be looked up' : 'Optional, e.g. 40s and rainy'}
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
          />
        </label>

        {hasKey && (
          <div className="space-y-1">
            <WebToggle on={search} onChange={setSearch} />
            <p className="text-xs text-slate-500 dark:text-slate-400">Web on looks up the forecast. Off, it plans for typical weather.</p>
          </div>
        )}
      </fieldset>

      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</p>}

      {hasKey ? (
        <button type="submit" className="btn-primary w-full" disabled={!place.trim() || busy}>
          {busy ? (search ? 'Checking the weather and packing…' : 'Packing…') : '✦ Make my packing list'}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">Add your Gemini key in Settings to have the list made from your closet. You can still start one by hand.</p>
          <button type="submit" className="btn-primary w-full" disabled={!place.trim()}>
            Start an empty list
          </button>
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------- one trip

const CAT_INDEX = Object.fromEntries(CATEGORIES.map((c, i) => [c.key, i]))

function LineRow({
  line,
  item,
  editing,
  onToggle,
  onRemove,
}: {
  line: PackLine
  item?: ClothingItem
  editing: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const thumb = line.itemId !== undefined
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={line.packed}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
      >
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
            line.packed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'
          }`}
        >
          {line.packed ? '✓' : ''}
        </span>
        {thumb && (
          <ClothingThumb
            item={item ?? { name: line.name, category: line.category ?? 'top' }}
            className={`w-10 shrink-0 rounded-lg ${line.packed ? 'opacity-50' : ''}`}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block break-words ${line.packed ? 'text-slate-400 line-through dark:text-slate-500' : ''}`}>{item?.name ?? line.name}</span>
          {line.note && <span className="block text-xs text-slate-500 dark:text-slate-400">{line.note}</span>}
        </span>
        {line.qty > 1 && <span className="shrink-0 text-sm text-slate-500 tabular-nums">×{line.qty}</span>}
      </button>
      {editing && (
        <button type="button" aria-label={`Remove ${line.name}`} onClick={onRemove} className="shrink-0 rounded-full px-2.5 py-1 text-slate-400 hover:text-rose-600">
          ✕
        </button>
      )}
    </li>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800/70">{children}</ul>
    </section>
  )
}

function TripView({ trip, items, hasKey, onBack }: { trip: Trip; items: ClothingItem[]; hasKey: boolean; onBack: () => void }) {
  const [editing, setEditing] = useState(false)
  const [extra, setExtra] = useState('')
  const [change, setChange] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const byId = new Map(items.map((i) => [i.id, i]))
  const { done, total } = packedCount(trip)

  const edit = (change: (lines: PackLine[]) => PackLine[]) => void editLines(trip.id, change)
  const toggle = (key: string) => edit((lines) => lines.map((l) => (l.key === key ? { ...l, packed: !l.packed } : l)))
  const remove = (key: string) => edit((lines) => lines.filter((l) => l.key !== key))

  const closet = trip.lines
    .filter((l) => l.itemId !== undefined)
    .sort((a, b) => (CAT_INDEX[a.category ?? 'top'] ?? 0) - (CAT_INDEX[b.category ?? 'top'] ?? 0))
  const extras = trip.lines.filter((l) => l.itemId === undefined && !l.buy)
  const toBuy = trip.lines.filter((l) => l.itemId === undefined && l.buy)
  const row = (l: PackLine) => (
    <LineRow key={l.key} line={l} item={l.itemId ? byId.get(l.itemId) : undefined} editing={editing} onToggle={() => toggle(l.key)} onRemove={() => remove(l.key)} />
  )

  function addExtra() {
    const names = extra.split(',').map((s) => s.trim()).filter(Boolean)
    if (!names.length) return
    const stamp = Date.now().toString(36)
    edit((lines) => {
      const have = new Set(lines.map((l) => l.name.toLowerCase()))
      const added = names
        .filter((n) => !have.has(n.toLowerCase()))
        .map((name, i): PackLine => ({ key: `m${stamp}${i}`, name, qty: 1, packed: false }))
      return [...lines, ...added]
    })
    setExtra('')
  }

  async function askChange() {
    const req = change.trim()
    if (!req || busy) return
    setBusy(true)
    setError('')
    try {
      await adjustTrip(trip, req, items)
      setChange('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <button type="button" onClick={onBack} className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
          ‹ All trips
        </button>
        <h2 className="mt-2 text-xl font-semibold break-words">{trip.place}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{tripDates(trip)}</p>
        {trip.occasions.length + (trip.plans ? 1 : 0) > 0 && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{[trip.occasions.join(', '), trip.plans].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      {(trip.weather || trip.summary) && (
        <div className="card space-y-1.5 text-sm">
          {trip.weather && (
            <p>
              <span className="font-medium">Weather:</span> {trip.weather}
            </p>
          )}
          {trip.summary && <p className="text-slate-600 dark:text-slate-300">{trip.summary}</p>}
          <Sources sources={trip.sources} />
        </div>
      )}

      {total > 0 && (
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {done} of {total} packed
            </span>
            {done === total && <span className="text-emerald-600 dark:text-emerald-400">All set</span>}
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      )}

      {closet.length > 0 && <Group title="From your closet">{closet.map(row)}</Group>}
      {extras.length > 0 && <Group title="Also bring">{extras.map(row)}</Group>}
      {toBuy.length > 0 && <Group title="Don't own yet">{toBuy.map(row)}</Group>}
      {total === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nothing on this list yet.</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addExtra()
        }}
      >
        <input className="field" placeholder="Add something, e.g. passport" aria-label="Add to list" value={extra} onChange={(e) => setExtra(e.target.value)} enterKeyHint="done" />
        <button
          type="submit"
          aria-label="Add to list"
          disabled={!extra.trim()}
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800"
        >
          +
        </button>
      </form>

      {hasKey && (
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void askChange()
          }}
        >
          <p className="text-sm font-medium">✦ Change the list</p>
          <input
            className="field"
            placeholder="e.g. add a gym day, fewer shoes"
            aria-label="Change the list"
            value={change}
            disabled={busy}
            onFocus={warmUp}
            onChange={(e) => setChange(e.target.value)}
            enterKeyHint="send"
          />
          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="submit" className="btn-secondary w-full" disabled={!change.trim() || busy}>
            {busy ? 'Updating…' : 'Update list'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
        <div className="flex gap-4">
          {total > 0 && (
            <button type="button" className="font-medium text-indigo-600 dark:text-indigo-400" onClick={() => setEditing(!editing)}>
              {editing ? 'Done editing' : 'Edit list'}
            </button>
          )}
          {done > 0 && (
            <button type="button" className="font-medium text-indigo-600 dark:text-indigo-400" onClick={() => edit((lines) => lines.map((l) => ({ ...l, packed: false })))}>
              Uncheck all
            </button>
          )}
        </div>
        <button
          type="button"
          className="text-rose-600 dark:text-rose-400"
          onClick={async () => {
            if (confirm(`Delete the packing list for ${trip.place}? Your clothes stay in your closet.`)) {
              await db.trips.delete(trip.id)
              onBack()
            }
          }}
        >
          Delete trip…
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- trips list

const OPEN_KEY = 'ledger.closet.trip'

function readOpen(): number | null {
  try {
    const v = Number(sessionStorage.getItem(OPEN_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

export default function Pack({ items, hasKey }: { items: ClothingItem[]; hasKey: boolean }) {
  const trips = useLiveQuery(() => db.trips.orderBy('createdAt').reverse().toArray(), [])
  const [openId, setOpenIdState] = useState<number | null>(readOpen)
  const [adding, setAdding] = useState(false)
  const closeAdd = useCallback(() => setAdding(false), [])

  const setOpenId = (id: number | null) => {
    setOpenIdState(id)
    try {
      if (id) sessionStorage.setItem(OPEN_KEY, String(id))
      else sessionStorage.removeItem(OPEN_KEY)
    } catch {
      /* storage unavailable */
    }
    window.scrollTo(0, 0)
  }

  if (!trips) return null
  const open = trips.find((t) => t.id === openId)
  if (open) return <TripView trip={open} items={items} hasKey={hasKey} onBack={() => setOpenId(null)} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {trips.length} packing list{trips.length === 1 ? '' : 's'}
        </p>
        <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
          + New trip
        </button>
      </div>

      {trips.length ? (
        <ul className="space-y-3">
          {trips.map((t) => {
            const { done, total } = packedCount(t)
            return (
              <li key={t.id}>
                <button type="button" onClick={() => setOpenId(t.id)} className="card block w-full text-left">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{t.place}</p>
                    <span className="shrink-0 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {done}/{total}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{tripDates(t)}</p>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / total) * 100}%` }} />
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="card py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-200">No trips yet</p>
          <p className="mt-1">Tell it where you're going and for how long, and it packs from your closet.</p>
        </div>
      )}

      <Sheet open={adding} onClose={closeAdd} title="New trip">
        <NewTrip
          items={items}
          hasKey={hasKey}
          onCreated={(id) => {
            setAdding(false)
            setOpenId(id)
          }}
        />
      </Sheet>
    </div>
  )
}
