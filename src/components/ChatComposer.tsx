import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { warmUp } from '../gemini'
import { WebToggle } from './WebSearch'

const toBottom = (smooth = true) =>
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })

/**
 * Chat scrolling: open at the latest message; follow your own message and the
 * typing indicator to the bottom; when a reply arrives, show it from its top
 * so long recipes/outfits are read from the start. Elements need data-msg-id.
 */
export function useChatScroll(messages: { id: string; role: string }[] | null, busy: unknown) {
  const lastId = useRef<string | null>(null)
  const opened = useRef(false)
  useEffect(() => {
    if (!messages) return
    const last = messages[messages.length - 1]
    if (!opened.current) {
      opened.current = true
      lastId.current = last?.id ?? null
      requestAnimationFrame(() => toBottom(false))
      return
    }
    if (busy) {
      requestAnimationFrame(() => toBottom())
      return
    }
    if (last && last.id !== lastId.current) {
      lastId.current = last.id
      requestAnimationFrame(() => {
        if (last.role === 'model') document.querySelector(`[data-msg-id="${last.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else toBottom()
      })
    }
  }, [messages, busy])
}

/** Keeps a scrolled-to message clear of the sticky header and, when it's showing, the section ribbon. */
export const MSG_SCROLL_MARGIN = 'scroll-mt-[calc(4rem+env(safe-area-inset-top)+var(--ribbon-offset,0px))]'

function NewChatIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

/**
 * Chat input bar pinned just above the tab bar, always visible. Holds the Web
 * toggle and a New chat button on top, the input row below. Publishes its
 * height as --composer-h so the message list can leave room for it.
 */
export default function ChatComposer({
  web,
  onWeb,
  onNewChat,
  canReset,
  children,
}: {
  web: boolean
  onWeb: (v: boolean) => void
  onNewChat: () => void
  canReset: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--composer-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.setProperty('--composer-h', '0px')
    }
  }, [])

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 z-[7] border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      style={{ bottom: 'calc(var(--nav-h, 64px) - var(--vp-gap, 0px))' }}
    >
      <div className="mx-auto max-w-xl px-4 pt-2 pb-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <WebToggle on={web} onChange={onWeb} />
          <button
            type="button"
            onClick={onNewChat}
            disabled={!canReset}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-indigo-600 ring-1 ring-indigo-200 disabled:text-slate-400 disabled:ring-slate-200 dark:text-indigo-400 dark:ring-indigo-900 dark:disabled:text-slate-600 dark:disabled:ring-slate-800"
          >
            <NewChatIcon className="h-4 w-4" />
            New chat
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Space at the end of a message list so the last message clears the fixed composer. */
export function ComposerSpacer() {
  return <div aria-hidden="true" style={{ height: 'calc(var(--composer-h, 120px) + 0.5rem)' }} />
}

export interface ChatInputHandle {
  /** What's currently typed. */
  getText: () => string
  clear: () => void
}

/**
 * The message box and Send button. It keeps the typed text in its own state,
 * so typing redraws only this small row and never the conversation above it.
 */
export function ChatInput({
  ref,
  placeholder,
  label,
  busy,
  onSend,
  leading,
}: {
  ref?: Ref<ChatInputHandle>
  placeholder: string
  label: string
  busy: boolean
  onSend: (text: string) => void
  /** Optional control shown left of the text box (e.g. the camera button). */
  leading?: ReactNode
}) {
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)

  const clear = () => {
    setText('')
    if (box.current) box.current.style.height = 'auto'
  }
  useImperativeHandle(ref, () => ({ getText: () => box.current?.value ?? '', clear }), [])

  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    onSend(t)
    clear()
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {leading}
      <textarea
        ref={box}
        rows={1}
        className="field max-h-32 min-w-0 flex-1 resize-none"
        placeholder={placeholder}
        aria-label={label}
        value={text}
        onFocus={warmUp}
        onChange={(e) => {
          setText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onKeyDown={(e) => {
          // Return sends on a computer; on a phone it adds a line and Send sends.
          if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button type="submit" className="btn-primary h-[46px] shrink-0" disabled={busy || !text.trim()}>
        Send
      </button>
    </form>
  )
}

/**
 * Shown while the AI is working: the reply so far if any has streamed in,
 * followed by animated dots and an optional status label.
 */
export function TypingBubble({ text, label }: { text?: string | null; label?: string }) {
  return (
    <div
      className="inline-block max-w-full rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm break-words shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
      role="status"
      aria-label={label ?? 'Thinking'}
    >
      {text && <p className="mb-2">{text}</p>}
      <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
        {label && <span>{label}…</span>}
      </span>
    </div>
  )
}
