import { useState } from 'react'
import { BASIC_TOOLS, COMMON_EQUIPMENT, addTo, saveEquipment, saveStaples, type Equipment } from '../../meals'
import type { MealsData } from '../../useMealsData'

const has = (list: string[], name: string) => list.some((x) => x.toLowerCase() === name.toLowerCase())

function AddRow({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (items: string[]) => void }) {
  const [text, setText] = useState('')
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
      <input className="field" placeholder={placeholder} aria-label={label} value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
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

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
        on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'
      }`}
      aria-hidden="true"
    >
      {on && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="m5 12 5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

export default function Staples({ data }: { data: MealsData }) {
  const { staples, equipment } = data

  const toggle = (name: string) => {
    const on = has(equipment.have, name)
    const next: Equipment = {
      ...equipment,
      have: on ? equipment.have.filter((x) => x.toLowerCase() !== name.toLowerCase()) : [...equipment.have, name],
    }
    void saveEquipment(next)
  }

  const addEquipment = (items: string[]) => {
    const commonNames = COMMON_EQUIPMENT.flatMap((g) => g.items)
    const custom = addTo(
      equipment.custom,
      items.filter((i) => !has(commonNames, i)),
    )
    void saveEquipment({ custom, have: addTo(equipment.have, items) })
  }

  const removeCustom = (name: string) =>
    void saveEquipment({
      custom: equipment.custom.filter((x) => x !== name),
      have: equipment.have.filter((x) => x.toLowerCase() !== name.toLowerCase()),
    })

  const haveCount = equipment.have.length

  return (
    <div className="space-y-8">
      {/* ---- Ingredients ---- */}
      <section aria-label="Ingredients on hand">
        <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
          <h2 className="font-semibold">
            Ingredients on hand <span className="text-sm font-normal text-slate-400">{staples.length}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Foods you always keep. Recipes are built around these first.</p>
        </div>
        <AddRow placeholder="e.g. eggs, rice, chicken breast" label="Add ingredient" onAdd={(items) => void saveStaples(addTo(staples, items))} />
        {staples.length ? (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/70">
            {staples.map((s) => (
              <li key={s} className="flex items-center gap-3 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">{s}</span>
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  className="rounded-full px-2.5 py-1 text-slate-400 hover:text-rose-600"
                  onClick={() => void saveStaples(staples.filter((x) => x !== s))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-slate-400">Nothing yet.</p>
        )}
      </section>

      {/* ---- Equipment ---- */}
      <section aria-label="Kitchen equipment">
        <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
          <h2 className="font-semibold">
            Kitchen equipment <span className="text-sm font-normal text-slate-400">{haveCount}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Recipes only use what's checked. Basics are always assumed: {BASIC_TOOLS}.
          </p>
        </div>

        {COMMON_EQUIPMENT.map((g) => (
          <div key={g.group} className="mt-4">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.group}</h3>
            <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800/70">
              {g.items.map((item) => {
                const on = has(equipment.have, item)
                return (
                  <li key={item}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(item)}
                      className="flex w-full items-center gap-3 py-2.5 text-left"
                    >
                      <Check on={on} />
                      <span className={`capitalize ${on ? '' : 'text-slate-500 dark:text-slate-400'}`}>{item}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <div className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Your other tools</h3>
          {equipment.custom.length > 0 && (
            <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800/70">
              {equipment.custom.map((item) => {
                const on = has(equipment.have, item)
                return (
                  <li key={item} className="flex items-center gap-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(item)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                    >
                      <Check on={on} />
                      <span className={`break-words capitalize ${on ? '' : 'text-slate-500 dark:text-slate-400'}`}>{item}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item}`}
                      className="rounded-full px-2.5 py-1 text-slate-400 hover:text-rose-600"
                      onClick={() => removeCustom(item)}
                    >
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <AddRow placeholder="e.g. pizza stone, smoker, panini press" label="Add equipment" onAdd={addEquipment} />
        </div>
      </section>
    </div>
  )
}
