import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ClothingItem } from '../../db'
import { warmUp } from '../../gemini'
import { navigate } from '../../router'
import { CATEGORY_BY_KEY, blobToDataURL, boxToRegion, makeThumb, prepareForAI, saveItem } from '../../closet'
import {
  askStylist,
  detectItems,
  loadClosetChat,
  saveClosetChat,
  saveOutfit,
  type ClosetMessage,
} from '../../closetAI'
import ClothingThumb from '../../components/ClothingThumb'
import { SearchedBadge, Sources } from '../../components/WebSearch'
import ChatComposer, {
  ChatInput,
  ComposerSpacer,
  MSG_SCROLL_MARGIN,
  TypingBubble,
  useChatScroll,
  type ChatInputHandle,
} from '../../components/ChatComposer'
import { CameraIcon } from '../../components/Icons'

const STARTERS = ['Outfit for work tomorrow', 'Casual weekend fit', 'Going out tonight', 'What am I missing in my wardrobe?']

const uid = () => Math.random().toString(36).slice(2, 10)

async function dataURLToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

function Bubble({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'error' }) {
  return (
    <div
      className={`rounded-2xl rounded-tl-md px-4 py-3 text-sm break-words ${
        tone === 'error'
          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
          : 'bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800'
      }`}
    >
      {children}
    </div>
  )
}

function ModelMessage({ m, items, onChange }: { m: ClosetMessage; items: ClothingItem[]; onChange: (p: Partial<ClosetMessage>) => void }) {
  const [working, setWorking] = useState(false)
  if (m.error) return <Bubble tone="error">{m.text}</Bubble>

  const o = m.reply?.outfit
  const outfitItems = o ? o.itemIds.map((id) => items.find((i) => i.id === id)).filter((i): i is ClothingItem => !!i) : []
  const det = m.detected
  const chosen = det?.filter((d) => d.selected) ?? []

  return (
    <div className="space-y-2">
      <Bubble>{m.text}</Bubble>
      <Sources sources={m.sources} />

      {det && det.length > 0 && (
        <div className="card">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {m.addedIds ? `Added ${m.addedIds.length} to your closet` : 'Found in your photo · tap to choose'}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {det.map((d, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={!!m.addedIds}
                  aria-pressed={d.selected}
                  onClick={() => onChange({ detected: det.map((x, j) => (j === i ? { ...x, selected: !x.selected } : x)) })}
                  className={`relative block w-full overflow-hidden rounded-xl text-left ring-2 transition ${
                    d.selected ? 'ring-indigo-600' : 'opacity-50 ring-transparent'
                  }`}
                >
                  <img src={d.thumb} alt={d.name} className="aspect-square w-full object-cover" />
                  {!m.addedIds && (
                    <span
                      className={`absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        d.selected ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-400'
                      }`}
                    >
                      {d.selected ? '✓' : ''}
                    </span>
                  )}
                  <span className="block px-2 py-1.5">
                    <span className="block truncate text-xs font-medium">{d.name}</span>
                    <span className="block truncate text-[11px] text-slate-500 first-letter:uppercase">
                      {CATEGORY_BY_KEY[d.category]?.label} · {d.color}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!m.addedIds && (
            <button
              type="button"
              className="btn-primary mt-3 w-full"
              disabled={!chosen.length || working}
              onClick={async () => {
                setWorking(true)
                const ids: number[] = []
                for (const d of chosen) {
                  ids.push(
                    await saveItem({
                      name: d.name,
                      category: d.category,
                      color: d.color,
                      pattern: d.pattern,
                      fit: d.fit,
                      description: d.description,
                      photo: await dataURLToBlob(d.thumb),
                    }),
                  )
                }
                onChange({ addedIds: ids })
                setWorking(false)
              }}
            >
              Add {chosen.length} item{chosen.length === 1 ? '' : 's'} to closet
            </button>
          )}
          {m.addedIds && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Edit any of them from the Items tab.</p>}
        </div>
      )}

      {o && (
        <div className="card">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">{o.name}</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{o.occasion}</span>
          </div>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {outfitItems.map((i) => (
              <li key={i.id}>
                <ClothingThumb item={i} className="rounded-xl" />
                <p className="mt-1 truncate text-[11px] font-medium">{i.name}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{o.why}</p>
          {o.addOns && o.addOns.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Would complete it: {o.addOns.join(', ')}</p>
          )}
          <div className="mt-3">
            {m.savedOutfitId ? (
              <p className="text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">★ Saved to outfits</p>
            ) : (
              <button
                type="button"
                className="btn-primary w-full"
                onClick={async () => onChange({ savedOutfitId: await saveOutfit(o) })}
              >
                ☆ Save outfit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One message in the conversation. Memoized, so a message only redraws when it
 * changes itself, not on every streamed word or state change around it.
 */
const MessageRow = memo(function MessageRow({
  m,
  items,
  onPatch,
}: {
  m: ClosetMessage
  items: ClothingItem[]
  onPatch: (id: string, patch: Partial<ClosetMessage>) => void
}) {
  if (m.role === 'user') {
    return (
      <div data-msg-id={m.id} className={`flex justify-end ${MSG_SCROLL_MARGIN}`}>
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-indigo-600 px-4 py-2.5 text-sm break-words whitespace-pre-wrap text-white">
          {m.searched && <SearchedBadge />}
          {m.text}
        </div>
      </div>
    )
  }
  return (
    <div data-msg-id={m.id} className={MSG_SCROLL_MARGIN}>
      <ModelMessage m={m} items={items} onChange={(patch) => onPatch(m.id, patch)} />
    </div>
  )
})

export default function Stylist({
  items,
  hasKey,
  pending,
  onPendingConsumed,
}: {
  items: ClothingItem[]
  hasKey: boolean | undefined
  pending?: { display: string; prompt: string } | null
  onPendingConsumed?: () => void
}) {
  const [messages, setMessages] = useState<ClosetMessage[] | null>(null)
  // Always the latest messages, for code that runs after an await.
  const messagesRef = useRef<ClosetMessage[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // The reply sentence while it is still streaming in.
  const [draft, setDraft] = useState<string | null>(null)
  const [web, setWeb] = useState(false)
  const inputApi = useRef<ChatInputHandle>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadClosetChat().then((m) => {
      messagesRef.current = m
      setMessages(m)
    })
  }, [])

  // Open the connection to Gemini as soon as the screen is up.
  useEffect(() => {
    if (hasKey) warmUp()
  }, [hasKey])

  useChatScroll(messages, busy)

  const update = useCallback((next: ClosetMessage[]) => {
    messagesRef.current = next
    setMessages(next)
    void saveClosetChat(next)
  }, [])

  const patch = useCallback(
    (id: string, p: Partial<ClosetMessage>) => {
      const cur = messagesRef.current
      if (cur) update(cur.map((x) => (x.id === id ? { ...x, ...p } : x)))
    },
    [update],
  )

  useEffect(() => {
    if (!pending || !messages || busy || hasKey !== true) return
    onPendingConsumed?.()
    void send(pending.prompt, pending.display)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, messages === null, hasKey])

  async function send(prompt: string, display?: string, base: ClosetMessage[] | null = messagesRef.current, search: boolean = web) {
    const p = prompt.trim()
    if (!p || busy || !base) return
    const userMsg: ClosetMessage = {
      id: uid(),
      role: 'user',
      text: display ?? p,
      ...(display ? { prompt: p } : {}),
      ...(search ? { searched: true } : {}),
    }
    const withUser = [...base, userMsg]
    update(withUser)
    setDraft(null)
    setBusy(search ? 'Searching the web' : 'Thinking')
    // Add the answer to whatever the conversation is by then: a button tapped
    // on an older message while waiting must not be undone.
    const append = (m: ClosetMessage) => update([...(messagesRef.current ?? withUser), m])
    try {
      const { reply, sources } = await askStylist(base, p, { search, items, onReply: setDraft })
      append({ id: uid(), role: 'model', text: reply.reply, reply, ...(sources?.length ? { sources } : {}) })
    } catch (e) {
      append({ id: uid(), role: 'model', text: (e as Error).message, error: true })
    } finally {
      setBusy(null)
      setDraft(null)
    }
  }

  async function addFromPhoto(file: File) {
    const current = messagesRef.current
    if (!current || busy) return
    const note = inputApi.current?.getText().trim() ?? ''
    const userMsg: ClosetMessage = { id: uid(), role: 'user', text: `Photo: add what I'm wearing${note ? ` (${note})` : ''}`, photoNote: true }
    const withUser = [...current, userMsg]
    update(withUser)
    inputApi.current?.clear()
    setDraft(null)
    setBusy('Looking at your photo')
    const append = (m: ClosetMessage) => update([...(messagesRef.current ?? withUser), m])
    try {
      const img = await prepareForAI(file)
      const { reply, items: found } = await detectItems(img.base64, note || undefined)
      const scaleX = img.bitmap.width / img.width
      const scaleY = img.bitmap.height / img.height
      const detected = await Promise.all(
        found.map(async (d) => {
          const r = boxToRegion(d.box, img.width, img.height)
          const thumb = await makeThumb(img.bitmap, { x: r.x * scaleX, y: r.y * scaleY, w: r.w * scaleX, h: r.h * scaleY })
          const { box: _box, ...fields } = d
          void _box
          return { ...fields, thumb: await blobToDataURL(thumb), selected: true }
        }),
      )
      append({
        id: uid(),
        role: 'model',
        text: detected.length ? reply || `Found ${detected.length} items.` : "I couldn't make out any clothing in that photo. Try a well-lit, full-body shot.",
        detected,
      })
    } catch (e) {
      append({ id: uid(), role: 'model', text: (e as Error).message, error: true })
    } finally {
      setBusy(null)
    }
  }

  if (hasKey === false) {
    return (
      <div className="card text-center">
        <p className="font-semibold">Add your Gemini key to use the Maker</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">It's stored only on this device.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => navigate('settings')}>
          Open Settings
        </button>
      </div>
    )
  }
  if (!messages) return null

  const last = messages[messages.length - 1]
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <div className="space-y-3">
          <div className="card">
            <p className="font-semibold">What are we wearing?</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              I know your {items.length} item{items.length === 1 ? '' : 's'} and your measurements. Ask for an outfit, or snap a photo to add what you're wearing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-xl bg-indigo-600 px-4 py-3 text-left text-sm font-medium text-white shadow-sm"
          >
            <CameraIcon className="h-6 w-6 shrink-0" />
            Add clothes from a photo of what I'm wearing
          </button>
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
      ) : null}

      <div className="space-y-4">
        {messages.map((m) => (
          <MessageRow key={m.id} m={m} items={items} onPatch={patch} />
        ))}
        {busy && <TypingBubble text={draft} label={draft ? undefined : busy} />}
        {last?.error && lastUser && !busy && !lastUser.photoNote && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              // Drop the failed attempt, then resend it on the trimmed history.
              const trimmed = messages.slice(0, -2)
              void send(lastUser.prompt ?? lastUser.text, lastUser.prompt ? lastUser.text : undefined, trimmed, !!lastUser.searched)
            }}
          >
            Try again
          </button>
        )}
      </div>
      <ComposerSpacer />

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void addFromPhoto(f)
          e.target.value = ''
        }}
      />
      <ChatComposer
        web={web}
        onWeb={setWeb}
        canReset={messages.length > 0 && !busy}
        onNewChat={() => confirm('Start a new conversation? This one will be cleared.') && update([])}
      >
        <ChatInput
          ref={inputApi}
          placeholder="Ask for an outfit…"
          label="Message the outfit Maker"
          busy={!!busy}
          onSend={(t) => void send(t)}
          leading={
            <button
              type="button"
              className="btn-secondary h-[46px] w-[46px] shrink-0 px-0 text-lg"
              aria-label="Add clothes from a photo"
              disabled={!!busy}
              onClick={() => photoRef.current?.click()}
            >
              <CameraIcon className="mx-auto h-6 w-6" />
            </button>
          }
        />
      </ChatComposer>
    </div>
  )
}
