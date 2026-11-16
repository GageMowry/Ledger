import { getSetting } from './db'

/**
 * Gemini is called straight from the device. The API key lives only in the
 * on-device settings table; it is never part of the source code or the repo.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_MODEL = 'gemini-2.5-flash'

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
    throw new Error(message)
  }
  return res.json()
}

/** Validates the key and returns the models it can use for text/image generation. */
export async function listModels(apiKey: string): Promise<GeminiModel[]> {
  const data = await geminiFetch('models?pageSize=200', apiKey)
  const models: GeminiModel[] = (data.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes('generateContent'),
    )
    .map((m: { name: string; displayName?: string }) => ({
      id: m.name.replace(/^models\//, ''),
      displayName: m.displayName ?? m.name,
    }))
    .filter((m: GeminiModel) => m.id.startsWith('gemini'))
  return models.sort((a, b) => a.id.localeCompare(b.id))
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

export interface ChatTurn {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

/**
 * Multi-turn call with a system prompt and a JSON response schema, so the
 * reply always parses into the same shape. Returns the parsed object.
 */
export async function chatJSON<T>(system: string, turns: ChatTurn[], schema: object): Promise<T> {
  const apiKey = await getSetting<string>('geminiApiKey', '')
  if (!apiKey) throw new Error('Add your Gemini API key in Settings first.')
  const model = await getSetting<string>('geminiModel', DEFAULT_MODEL)
  const data = await geminiFetch(`models/${model}:generateContent`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.8 },
    }),
  })
  const cand = data.candidates?.[0]
  const text = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) {
    const reason = cand?.finishReason ?? data.promptFeedback?.blockReason
    throw new Error(reason ? `Gemini returned no answer (${reason}).` : 'Gemini returned an empty response.')
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Gemini sent a reply that could not be read. Try again.')
  }
}

/** One-shot generation. Used by every "Suggest..." button in later phases. */
export async function generate(parts: GeminiPart[], opts?: { json?: boolean }): Promise<string> {
  const apiKey = await getSetting<string>('geminiApiKey', '')
  if (!apiKey) throw new Error('Add your Gemini API key in Settings first.')
  const model = await getSetting<string>('geminiModel', DEFAULT_MODEL)
  const data = await geminiFetch(`models/${model}:generateContent`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: opts?.json ? { responseMimeType: 'application/json' } : undefined,
    }),
  })
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error('Gemini returned an empty response.')
  return text
}
