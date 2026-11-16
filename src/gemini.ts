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

async function geminiFetch(path: string, apiKey: string, init?: RequestInit) {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, ...init?.headers },
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      message = body?.error?.message ?? message
    } catch {
      /* keep status text */
    }
    const err = new Error(message) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json()
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

export async function resolveModels(force = false): Promise<ResolvedModels> {
  const cached = await getSetting<ResolvedModels | null>('resolvedModels', null)
  if (!force && cached && Date.now() - cached.checkedAt < 7 * 24 * 3600 * 1000) return cached
  const apiKey = await requireKey()
  let ids: string[] = []
  try {
    ids = (await listModels(apiKey)).map((m) => m.id)
  } catch {
    /* fall back to the preferred ids below */
  }
  const resolved: ResolvedModels = {
    lite: pickModel('lite', ids) ?? MODEL_RULES.lite.preferred,
    search: pickModel('search', ids) ?? MODEL_RULES.search.preferred,
    checkedAt: Date.now(),
  }
  await setSetting('resolvedModels', resolved)
  return resolved
}

/** POST generateContent, re-resolving the model id once if Google says it doesn't exist. */
async function generateContent(kind: ModelKind, body: object) {
  const apiKey = await requireKey()
  const call = async (force: boolean) => {
    const model = (await resolveModels(force))[kind]
    return geminiFetch(`models/${model}:generateContent`, apiKey, { method: 'POST', body: JSON.stringify(body) })
  }
  try {
    return await call(false)
  } catch (e) {
    if ((e as { status?: number }).status === 404) return call(true)
    throw e
  }
}

function textOf(data: { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } }) {
  const cand = data.candidates?.[0]
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!text) {
    const reason = cand?.finishReason ?? data.promptFeedback?.blockReason
    throw new Error(reason ? `Gemini returned no answer (${reason}).` : 'Gemini returned an empty response.')
  }
  return text
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
export async function chatJSON<T>(system: string, turns: ChatTurn[], schema: object): Promise<T> {
  const data = await generateContent('lite', {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns,
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.8 },
  })
  const text = textOf(data)
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
    sources.push({ uri, title: c.web?.title || new URL(uri).hostname })
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
  return { result: await chatJSON<T>(system, merged, schema), sources: research.sources }
}
