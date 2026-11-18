import { useState } from 'react'
import { BASIC_TOOLS, COMMON_EQUIPMENT, addTo, editStaplesOut, isOut, saveEquipment, saveStaples, saveStaplesOut } from '../../meals'
import type { MealsData } from '../../useMealsData'

const has = (list: string[], name: string) => list.some((x) => x.toLowerCase() === name.toLowerCase())

function AddRow({
  placeholder,
  label,
  onAdd,
  suggestions,
}: {
  placeholder: string
  label: string
  onAdd: (items: string[]) => void
  suggestions?: string[]
}) {
  const [text, setText] = useState('')
  const listId = `${label.replace(/\W/g, '')}-suggestions`
  const submit = () => {
    const items = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (!items.length) return
    onAdd(items)
    setText('')
  }
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        className="field"
        placeholder={placeholder}
        aria-label={label}
        value={text}
        list={suggestions?.length ? listId : undefined}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="done"
      />
      {suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <button
        type="submit"
        aria-label={label}
        disabled={!text.trim()}
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800"
      >
        +
      </button>
    </form>
  )
}

function Rows({ items, dot, onRemove, capitalize = false }: { items: string[]; dot: string; onRemove: (s: string) => void; capitalize?: boolean }) {
  if (!items.length) return <p className="py-3 text-sm text-slate-400">Nothing yet.</p>
  return (
    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/70">
      {items.map((s) => (
        <li key={s} className="flex items-center gap-3 py-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          <span className={`min-w-0 flex-1 break-words ${capitalize ? 'capitalize' : ''}`}>{s}</span>
          <button
            type="button"
            aria-label={`Remove ${s}`}
            className="rounded-full px-2.5 py-1 text-slate-400 hover:text-rose-600"
            onClick={() => onRemove(s)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Ingredients, each with an "Out" toggle for when you run out (kept on the list, skipped by the Maker). */
function StapleRows({ items, out, onToggle, onRemove }: { items: string[]; out: string[]; onToggle: (s: string) => void; onRemove: (s: string) => void }) {
  if (!items.length) return <p className="py-3 text-sm text-slate-400">Nothing yet.</p>
  return (
    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/70">
      {items.map((s) => {
        const gone = isOut(out, s)
        return (
          <li key={s} className="flex items-center gap-3 py-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${gone ? 'bg-amber-400' : 'bg-emerald-500'}`} aria-hidden="true" />
            <span className={`min-w-0 flex-1 break-words ${gone ? 'text-slate-400 line-through decoration-slate-300 dark:text-slate-500 dark:decoration-slate-600' : ''}`}>{s}</span>
            <button
              type="button"
              aria-pressed={gone}
              aria-label={gone ? `${s} is out. Mark as back in stock` : `Mark ${s} as ran out`}
              onClick={() => onToggle(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                gone
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                  : 'text-slate-500 ring-1 ring-slate-200 dark:text-slate-400 dark:ring-slate-700'
              }`}
            >
              {gone ? 'Ran out' : 'Out?'}
            </button>
            <button
              type="button"
              aria-label={`Remove ${s}`}
              className="shrink-0 rounded-full px-2 py-1 text-slate-400 hover:text-rose-600"
              onClick={() => onRemove(s)}
            >
              ✕
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default function Staples({ data }: { data: MealsData }) {
  const { staples, staplesOut, equipment } = data
  // Only count "out" entries that are still on the list.
  const outNow = staples.filter((s) => isOut(staplesOut, s))
  const toggleOut = (s: string) =>
    void editStaplesOut((out) => (isOut(out, s) ? out.filter((x) => x !== s.toLowerCase()) : [...out, s]))
  const removeStaple = (s: string) => {
    void saveStaples(staples.filter((x) => x !== s))
    void editStaplesOut((out) => out.filter((x) => x !== s.toLowerCase()))
  }
  const [browsing, setBrowsing] = useState(false)

  const allCommon = COMMON_EQUIPMENT.flatMap((g) => g.items)
  const notOwned = allCommon.filter((i) => !has(equipment.have, i))
  const owned = [...equipment.have].sort((a, b) => a.localeCompare(b))

  const addEquipment = (items: string[]) => {
    const custom = addTo(
      equipment.custom,
      items.filter((i) => !has(allCommon, i)),
    )
    void saveEquipment({ custom, have: addTo(equipment.have, items.map((i) => i.toLowerCase())) })
  }

  // Removing hides it; custom items are deleted outright since they're not in the suggestions.
  const removeEquipment = (name: string) =>
    void saveEquipment({
      custom: equipment.custom.filter((x) => x.toLowerCase() !== name.toLowerCase()),
      have: equipment.have.filter((x) => x.toLowerCase() !== name.toLowerCase()),
    })

  return (
    <div className="space-y-8">
      <section aria-label="Ingredients on hand">
        <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
          <h2 className="font-semibold">
            Ingredients on hand <span className="text-sm font-normal text-slate-400">{staples.length}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Foods you always keep. Recipes are built around these first. Tap “Out?” when you run out and the Maker won't count on it.
          </p>
        </div>
        <AddRow
          placeholder="e.g. eggs, rice, chicken breast"
          label="Add ingredient"
          onAdd={(items) => {
            void saveStaples(addTo(staples, items))
            // Adding something you already list means it's back in stock.
            const back = new Set(items.map((i) => i.trim().toLowerCase()))
            void editStaplesOut((out) => out.filter((x) => !back.has(x)))
          }}
        />
        {outNow.length > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
            <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
              <span className="font-medium">Ran out of {outNow.length}:</span> {outNow.join(', ')}
            </p>
            <button type="button" className="shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400" onClick={() => void saveStaplesOut([])}>
              Restocked
            </button>
          </div>
        )}
        <StapleRows items={staples} out={staplesOut} onToggle={toggleOut} onRemove={removeStaple} />
      </section>

      <section aria-label="Kitchen equipment">
        <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
          <h2 className="font-semibold">
            Kitchen equipment <span className="text-sm font-normal text-slate-400">{owned.length}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Recipes only use what's here, plus basics like {BASIC_TOOLS}.</p>
        </div>
        <AddRow placeholder="e.g. air fryer, rice cooker, cheese grater" label="Add equipment" onAdd={addEquipment} suggestions={notOwned} />
        <Rows items={owned} dot="bg-indigo-500" onRemove={removeEquipment} capitalize />

        {notOwned.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
              aria-expanded={browsing}
              onClick={() => setBrowsing(!browsing)}
            >
              {browsing ? 'Hide suggestions' : 'Show suggestions'}
            </button>
            {browsing && (
              <div className="mt-2 flex flex-wrap gap-2">
                {notOwned.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => addEquipment([item])}
                    className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-600 capitalize ring-1 ring-slate-200 hover:ring-indigo-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
