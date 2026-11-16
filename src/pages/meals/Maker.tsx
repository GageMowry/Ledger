import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting } from '../../db'
import { navigate } from '../../router'
import type { MealsData } from '../../useMealsData'
import RecipeView from '../../components/RecipeView'
import {
  applyUpdates,
  askMealMaker,
  describeUpdates,
  estimatePrompt,
  estimateTarget,
  loadChat,
  saveChat,
  saveEstimate,
  saveRecipe,
  undoUpdates,
  type ChatMessage,
} from '../../mealMaker'
import type { Meal } from '../../db'
import { SearchedBadge, Sources, WebToggle } from '../../components/WebSearch'

const STARTERS = [
  'Quick high-protein dinner with what I have',
  'What can I make with only my staples?',
  'Something new I haven’t had before',
  'Help me build out my preferences',
]

const uid = () => Math.random().toString(36).slice(2, 10)

function EstimateCard({ m, target, onChange }: { m: ChatMessage; target?: Meal; onChange: (patch: Partial<ChatMessage>) => void }) {
  const e = m.reply!.macroEstimate!
  const stats = [
    { label: 'Calories', value: `${e.calories}` },
    { label: 'Protein', value: `${e.protein}g` },
    { label: 'Carbs', value: `${e.carbs}g` },
    { label: 'Fat', value: `${e.fat}g` },
  ]
  return (
    <div className="card">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Estimate per serving{target ? ` · ${target.name}` : ''}
        {e.servings ? ` · serves ${e.servings}` : ''}
      </p>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
            <dt className="text-[11px] text-slate-500 uppercase dark:text-slate-400">{s.label}</dt>
            <dd className="text-base font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {e.basis && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{e.basis}</p>}
      {target && (
        <div className="mt-3">
          {m.estimateSaved ? (
            <p className="text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Saved to {target.name}</p>
          ) : (
            <button
              type="button"
              className="btn-primary w-full"
              onClick={async () => {
                await saveEstimate(target.id, e)
                onChange({ estimateSaved: true })
              }}
            >
              Save to “{target.name}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ModelMessage({
  m,
  target,
  onChange,
}: {
  m: ChatMessage
  target?: Meal
  onChange: (patch: Partial<ChatMessage>) => void
}) {
  const r = m.reply?.recipe
  const changes = m.applied ? describeUpdates(m.applied) : []
  const [saving, setSaving] = useState(false)

  if (m.error) {
    return (
      <div className="rounded-2xl rounded-tl-md bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
        {m.text}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        {m.text}
      </div>
      <Sources sources={m.sources} />

      {changes.length > 0 && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl px-3 py-2 text-xs ${
            m.undone ? 'bg-slate-100 text-slate-500 line-through dark:bg-slate-800' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
          }`}
        >
          <ul className="space-y-0.5">
            {changes.map((c) => (
              <li key={c}>✓ {c}</li>
            ))}
          </ul>
          {!m.undone && m.applied && (
            <button
              type="button"
              className="shrink-0 font-semibold no-underline"
              onClick={async () => {
                await undoUpdates(m.applied!)
                onChange({ undone: true })
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      {m.reply?.macroEstimate && <EstimateCard m={m} target={target} onChange={onChange} />}

      {r && (
        <div className="card">
          <RecipeView
            r={{
              name: r.name,
              servings: r.servings,
              prepMin: r.prepMin,
              cookMin: r.cookMin,
              calories: r.calories ?? undefined,
              protein: r.protein ?? undefined,
              carbs: r.carbs ?? undefined,
              fat: r.fat ?? undefined,
              ingredients: r.ingredients.map((i) => ({ text: `${i.amount} ${i.item}`.trim(), staple: i.fromStaples })),
              steps: r.steps,
              notes: r.tips ?? undefined,
            }}
          />
          <div className="mt-4">
            {m.savedMealId ? (
              <p className="text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">★ Saved to favorites</p>
            ) : (
              <button
                type="button"
                className="btn-primary w-full"
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  const id = await saveRecipe(r)
                  onChange({ savedMealId: id })
                  setSaving(false)
                }}
              >
                ☆ Save to favorites
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Maker({
  data,
  pendingEstimate,
  onPendingConsumed,
}: {
  data: MealsData
  pendingEstimate?: Meal | null
  onPendingConsumed?: () => void
}) {
  const hasKey = useLiveQuery(async () => !!(await getSetting<string>('geminiApiKey', '')), [])
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [web, setWeb] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void loadChat().then(setMessages)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages?.length, busy])

  const update = (next: ChatMessage[]) => {
    setMessages(next)
    void saveChat(next)
  }

  // "Estimate macros" from Favorites lands here with the recipe ready to send.
  useEffect(() => {
    if (!pendingEstimate || !messages || busy || hasKey !== true) return
    onPendingConsumed?.()
    void send(estimatePrompt(pendingEstimate), { display: `Estimate macros for “${pendingEstimate.name}”`, estimateFor: pendingEstimate.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEstimate, messages === null, hasKey])

  async function send(prompt: string, opts?: { display?: string; estimateFor?: number; base?: ChatMessage[]; search?: boolean }) {
    const p = prompt.trim()
    const history = opts?.base ?? messages
    if (!p || busy || !history) return
    const search = opts?.search ?? web
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      text: opts?.display ?? p,
      ...(opts?.display ? { prompt: p } : {}),
      ...(opts?.estimateFor ? { estimateFor: opts.estimateFor } : {}),
      ...(search ? { searched: true } : {}),
    }
    const withUser = [...history, userMsg]
    update(withUser)
    setText('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setBusy(true)
    try {
      const { reply, sources } = await askMealMaker(data, history, userMsg.prompt ?? userMsg.text, { search })
      const applied = await applyUpdates(reply.updates)
      update([...withUser, { id: uid(), role: 'model', text: reply.reply, reply, applied, ...(sources?.length ? { sources } : {}) }])
    } catch (e) {
      update([...withUser, { id: uid(), role: 'model', text: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  if (hasKey === false) {
    return (
      <div className="card text-center">
        <p className="font-semibold">Add your Gemini key to use the Meal Maker</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">It's stored only on this device.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => navigate('settings')}>
          Open Settings
        </button>
      </div>
    )
  }
  if (!messages) return null

  const lastError = messages.length > 0 && messages[messages.length - 1].error
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <div className="space-y-3">
          <div className="card">
            <p className="font-semibold">What should we make?</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              I know your {data.staples.length} staples and your preferences. Ask for a meal, a craving, or what to do with something in the fridge.
            </p>
          </div>
          <div className="grid gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="rounded-xl bg-white px-4 py-3 text-left text-sm font-medium shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300 dark:bg-slate-900 dark:ring-slate-800"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">Uses your staples and preferences</p>
          <button
            type="button"
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
            disabled={busy}
            onClick={() => confirm('Start a new conversation?') && update([])}
          >
            New chat
          </button>
        </div>
      )}

      <div className="space-y-4">
        {messages.map((m, idx) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-indigo-600 px-4 py-2.5 text-sm text-white">
                {m.searched && <SearchedBadge />}
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="max-w-full">
              <ModelMessage
                m={m}
                target={(() => {
                  const id = estimateTarget(messages, idx)
                  return id ? data.meals.find((x) => x.id === id) : undefined
                })()}
                onChange={(patch) => update(messages.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))}
              />
            </div>
          ),
        )}
        {busy && (
          <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        {lastError && lastUser && !busy && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              // Drop the failed attempt, then resend it on the trimmed history.
              const trimmed = messages.slice(0, -2)
              void send(lastUser.prompt ?? lastUser.text, {
                display: lastUser.prompt ? lastUser.text : undefined,
                estimateFor: lastUser.estimateFor,
                base: trimmed,
                search: !!lastUser.searched,
              })
            }}
          >
            Try again
          </button>
        )}
        {/* Scroll target; the margin keeps the last message clear of the input bar and tab bar. */}
        <div ref={endRef} className="scroll-mb-40" />
      </div>

      <form
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-[5] rounded-2xl bg-slate-50/95 py-2 backdrop-blur dark:bg-slate-950/95"
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        <div className="mb-2">
          <WebToggle on={web} onChange={setWeb} />
        </div>
        <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          rows={1}
          className="field max-h-32 resize-none"
          placeholder="Ask for a meal…"
          aria-label="Message the Meal Maker"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault()
              void send(text)
            }
          }}
        />
        <button type="submit" className="btn-primary h-[46px] shrink-0" disabled={busy || !text.trim()}>
          Send
        </button>
        </div>
      </form>
    </div>
  )
}
