import { getSetting, setSetting } from './db'
import { todayISO } from './dates'

/**
 * Gemini is called straight from the device. The API key lives only in the
 * on-device settings table; it is never part of the source code or the repo.
 *
 * Model rules:
 *  - Every task uses Gemini 3.5 Flash-Lite.
 *  - Web search (the Web toggle in a Maker) uses Gemini 2.5 Flash with Google
 *    Search grounding, limited to SEARCH_DAILY_LIMIT calls per day.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta'

export const MODEL_RULES = {
  lite: { label: 'Gemini 3.5 Flash-Lite', preferred: 'gemini-3.5-flash-lite', family: /^gemini-3\.5-flash-lite/ },
  search: { label: 'Gemini 2.5 Flash', preferred: 'gemini-2.5-flash', family: /^gemini-2\.5-flash(?!-lite)/ },
} as const
export type ModelKind = keyof typeof MODEL_RULES

export const SEARCH_DAILY_LIMIT = 20

export interface GeminiModel {
  id: string // e.g. "gemini-2.5-flash"
  displayName: string
}

/** Turns Google's error into something actionable. */
export function friendlyError(status: number, raw: string): string {
  const r = raw.toLowerCase()
  if (status === 429 || r.includes('quota') || r.includes('exhausted')) {
    return r.includes('per day') || r.includes('daily')
      ? "Gemini's free daily limit is used up. It resets tomorrow."
      : "Gemini's free-tier rate limit was hit. Wait a minute, then try again."
  }
  if (r.includes('api key not valid') || r.includes('api_key_invalid')) return "Your Gemini API key isn't valid. Update it in Settings."
  if (status === 403) return "This API key isn't allowed to use that Gemini model. Check the key in Google AI Studio."
  if (status >= 500) return 'Gemini is busy right now. Try again in a moment.'
  if (r.includes('safety') || r.includes('blocked')) return 'Gemini declined to answer that. Try rewording it.'
  return raw
}

const networkError = () =>
  new Error(navigator.onLine === false ? "You're offline. AI features need an internet connection." : "Couldn't reach Gemini. Check your connection and try again.")

/** Sends a request and returns the raw response once Google has accepted it. */
async function geminiRequest(path: string, apiKey: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API}/${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, ...init?.headers },
    })
  } catch {
    throw networkError()
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      message = body?.error?.message ?? message
    } catch {
      /* keep status text */
    }
    const err = new Error(friendlyError(res.status, message)) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res
}

async function geminiFetch(path: string, apiKey: string, init?: RequestInit) {
  const res = await geminiRequest(path, apiKey, init)
  try {
    return await res.json()
  } catch {
    throw networkError()
  }
}

// ---------------------------------------------------------------- warm-up

const ORIGIN = 'https://generativelanguage.googleapis.com'
let warmedAt = 0

/**
 * Called when an AI screen opens or its text box is focused. Opens the
 * connection to Google ahead of time and makes sure the model names are
 * already looked up, so the first message doesn't pay for either.
 */
export function warmUp(): void {
  if (Date.now() - warmedAt < 60_000) return
  warmedAt = Date.now()
  try {
    document.getElementById('gemini-preconnect')?.remove()
    const link = document.createElement('link')
    link.id = 'gemini-preconnect'
    link.rel = 'preconnect'
    link.href = ORIGIN
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  } catch {
    /* a hint only; safe to skip */
  }
  void resolveModels().catch(() => {
    /* no key yet, or offline: the real call will report it */
  })
}

async function requireKey(): Promise<string> {
  const apiKey = await getSetting<string>('geminiApiKey', '')
  if (!apiKey) throw new Error('Add your Gemini API key in Settings first.')
  return apiKey
}

/** Validates the key and returns the models it can use for text/image generation. */
export async function listModels(apiKey: string): Promise<GeminiModel[]> {
  const data = await geminiFetch('models?pageSize=200', apiKey)
  const models: GeminiModel[] = (data.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: { name: string; displayName?: string }) => ({
      id: m.name.replace(/^models\//, ''),
      displayName: m.displayName ?? m.name,
    }))
    .filter((m: GeminiModel) => m.id.startsWith('gemini'))
  return models.sort((a, b) => a.id.localeCompare(b.id))
}

// ---------------------------------------------------------------- model resolution

interface ResolvedModels {
  lite: string
  search: string
  checkedAt: number
}

/** Picks the exact model id, or the closest release in the same family (e.g. a -preview id). */
export function pickModel(kind: ModelKind, available: string[]): string | null {
  const rule = MODEL_RULES[kind]
  if (available.includes(rule.preferred)) return rule.preferred
  const family = available.filter((id) => rule.family.test(id)).sort((a, b) => a.length - b.length || a.localeCompare(b))
  return family[0] ?? null
}

let resolving: Promise<ResolvedModels> | null = null

export async function resolveModels(force = false): Promise<ResolvedModels> {
  const cached = await getSetting<ResolvedModels | null>('resolvedModels', null)
  if (!force && cached && Date.now() - cached.checkedAt < 7 * 24 * 3600 * 1000) return cached
  // One lookup at a time: a warm-up and a first message may ask together.
  if (resolving) return resolving
  resolving = (async () => {
    const apiKey = await requireKey()
    const fallback: ResolvedModels = { lite: MODEL_RULES.lite.preferred, search: MODEL_RULES.search.preferred, checkedAt: Date.now() }
    let ids: string[]
    try {
      ids = (await listModels(apiKey)).map((m) => m.id)
    } catch {
      // Couldn't list models (offline, rate limit): use the preferred names for
      // now, but don't remember them, so the next call checks again.
      return fallback
    }
    const resolved: ResolvedModels = {
      lite: pickModel('lite', ids) ?? fallback.lite,
      search: pickModel('search', ids) ?? fallback.search,
      checkedAt: Date.now(),
    }
    await setSetting('resolvedModels', resolved)
    return resolved
  })()
  try {
    return await resolving
  } finally {
    resolving = null
  }
}

/** Runs a request against the model for `kind`, re-resolving the id once if Google says it doesn't exist. */
async function withModel<R>(kind: ModelKind, run: (model: string, apiKey: string) => Promise<R>): Promise<R> {
  const apiKey = await requireKey()
  try {
    return await run((await resolveModels())[kind], apiKey)
  } catch (e) {
    if ((e as { status?: number }).status === 404) return run((await resolveModels(true))[kind], apiKey)
    throw e
  }
}

/** POST generateContent and return the parsed response. */
function generateContent(kind: ModelKind, body: object) {
  return withModel(kind, (model, apiKey) =>
    geminiFetch(`models/${model}:generateContent`, apiKey, { method: 'POST', body: JSON.stringify(body) }),
  )
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { code?: number; message?: string }
}

const partsText = (data: GenerateResponse) =>
  data.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('') ?? ''

const emptyAnswer = (reason?: string) => new Error(reason ? `Gemini returned no answer (${reason}).` : 'Gemini returned an empty response.')

function textOf(data: GenerateResponse) {
  const text = partsText(data)
  if (!text) throw emptyAnswer(data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason)
  return text
}

/**
 * Same request as generateContent, but streamed: `onText` gets the text so far
 * each time more arrives, so the reply can appear while the rest is written.
 * Returns the full text. If the stream can't be read as expected, it falls
 * back to one ordinary request.
 */
async function generateContentStream(kind: ModelKind, body: object, onText: (soFar: string) => void): Promise<string> {
  const res = await withModel(kind, (model, apiKey) =>
    geminiRequest(`models/${model}:streamGenerateContent?alt=sse`, apiKey, { method: 'POST', body: JSON.stringify(body) }),
  )

  let text = ''
  let events = 0
  let reason: string | undefined
  const onEvent = (payload: string) => {
    if (!payload || payload === '[DONE]') return
    let data: GenerateResponse
    try {
      data = JSON.parse(payload) as GenerateResponse
    } catch {
      return
    }
    events += 1
    if (data.error) throw new Error(friendlyError(data.error.code ?? 500, data.error.message ?? 'Gemini reported an error.'))
    reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? reason
    const piece = partsText(data)
    if (piece) {
      text += piece
      onText(text)
    }
  }

  // Server-sent events: "data:" lines, with a blank line ending each event.
  let pending = ''
  let dataLines: string[] = []
  const feed = (chunk: string, final = false) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = final ? '' : (lines.pop() ?? '')
    for (const line of lines) {
      if (line === '') {
        if (dataLines.length) onEvent(dataLines.join('\n'))
        dataLines = []
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (final && dataLines.length) {
      onEvent(dataLines.join('\n'))
      dataLines = []
    }
  }

  const reader = res.body?.getReader?.()
  if (reader) {
    const decoder = new TextDecoder()
    for (;;) {
      let step: ReadableStreamReadResult<Uint8Array>
      try {
        step = await reader.read()
      } catch {
        throw networkError()
      }
      if (step.done) break
      feed(decoder.decode(step.value, { stream: true }))
    }
    feed(decoder.decode(), true)
  } else {
    let whole: string
    try {
      whole = await res.text()
    } catch {
      throw networkError()
    }
    feed(whole, true)
  }

  // Nothing recognisable came back as a stream: ask again the ordinary way.
  if (events === 0) return textOf(await generateContent(kind, body))
  if (!text) throw emptyAnswer(reason)
  return text
}

/**
 * Reads a string field out of JSON that is still arriving. Returns what has
 * been written of it so far (unescaped), or null if the field hasn't started.
 */
export function partialStringField(json: string, field: string): string | null {
  const start = new RegExp(`"${field}"\\s*:\\s*"`).exec(json)
  if (!start) return null
  let raw = ''
  for (let i = start.index + start[0].length; i < json.length; ) {
    const ch = json[i]
    if (ch === '"') break
    if (ch === '\\') {
      const len = json[i + 1] === 'u' ? 6 : 2
      if (i + len > json.length) break // escape sequence not complete yet
      raw += json.slice(i, i + len)
      i += len
    } else {
      raw += ch
      i += 1
    }
  }
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- calls

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

export interface ChatTurn {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

/**
 * Multi-turn call on Flash-Lite with a system prompt and a JSON response
 * schema, so the reply always parses into the same shape.
 */
export async function chatJSON<T>(
  system: string,
  turns: ChatTurn[],
  schema: object,
  /** When given, the reply is streamed and this gets the raw JSON text so far. */
  onPartial?: (jsonSoFar: string) => void,
): Promise<T> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns,
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.8 },
  }
  const text = onPartial ? await generateContentStream('lite', body, onPartial) : textOf(await generateContent('lite', body))
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Gemini sent a reply that could not be read. Try again.')
  }
}

// ---------------------------------------------------------------- web search (limited)

export interface SearchUsage {
  used: number
  left: number
  limit: number
}

interface StoredUsage {
  date: string
  count: number
}

export async function getSearchUsage(): Promise<SearchUsage> {
  const u = await getSetting<StoredUsage | null>('searchUsage', null)
  const used = u && u.date === todayISO() ? u.count : 0
  return { used, left: Math.max(0, SEARCH_DAILY_LIMIT - used), limit: SEARCH_DAILY_LIMIT }
}

async function countSearch(): Promise<void> {
  const { used } = await getSearchUsage()
  await setSetting('searchUsage', { date: todayISO(), count: used + 1 } satisfies StoredUsage)
}

export interface WebSource {
  title: string
  uri: string
}

/**
 * Plain-text answer from Gemini 2.5 Flash grounded with Google Search.
 * Counts toward the daily limit as soon as the request is sent.
 */
export async function searchText(system: string, turns: ChatTurn[]): Promise<{ text: string; sources: WebSource[] }> {
  const { left } = await getSearchUsage()
  if (left <= 0) throw new Error(`You've used all ${SEARCH_DAILY_LIMIT} web searches for today. Turn off Web to keep chatting.`)
  await countSearch()
  const data = await generateContent('search', {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns,
    tools: [{ google_search: {} }],
  })
  const text = textOf(data)
  const chunks: { web?: { uri?: string; title?: string } }[] = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const seen = new Set<string>()
  const sources: WebSource[] = []
  for (const c of chunks) {
    const uri = c.web?.uri
    if (!uri || seen.has(uri)) continue
    seen.add(uri)
    let host = uri
    try {
      host = new URL(uri).hostname
    } catch {
      /* keep the raw link */
    }
    sources.push({ uri, title: c.web?.title || host })
  }
  return { text, sources: sources.slice(0, 6) }
}

/**
 * Web-search answer converted into the app's structured format:
 * 2.5 Flash searches and writes, then Flash-Lite formats with the schema.
 */
export async function chatJSONWithSearch<T>(
  system: string,
  turns: ChatTurn[],
  schema: object,
  onPartial?: (jsonSoFar: string) => void,
): Promise<{ result: T; sources: WebSource[] }> {
  const research = await searchText(
    `${system}\n\nYou have Google Search. Use it for anything current or factual (recipes, nutrition facts, product details, trends). Answer the user's last message fully in plain text; include complete recipe ingredients and steps or outfit details if they apply.`,
    turns,
  )
  const last = turns[turns.length - 1]
  const merged: ChatTurn[] = [
    ...turns.slice(0, -1),
    {
      role: 'user',
      parts: [
        ...last.parts,
        { text: `\n\n[Web research for this message, from a search-enabled assistant. Base your answer on it.]\n${research.text}` },
      ],
    },
  ]
  return { result: await chatJSON<T>(system, merged, schema, onPartial), sources: research.sources }
}
