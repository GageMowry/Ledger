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
