import { useState } from 'react'
import { BASIC_TOOLS, COMMON_EQUIPMENT, addTo, saveEquipment, saveStaples } from '../../meals'
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

export default function Staples({ data }: { data: MealsData }) {
  const { staples, equipment } = data
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
          <p className="text-xs text-slate-500 dark:text-slate-400">Foods you always keep. Recipes are built around these first.</p>
        </div>
        <AddRow placeholder="e.g. eggs, rice, chicken breast" label="Add ingredient" onAdd={(items) => void saveStaples(addTo(staples, items))} />
        <Rows items={staples} dot="bg-emerald-500" onRemove={(s) => void saveStaples(staples.filter((x) => x !== s))} />
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
