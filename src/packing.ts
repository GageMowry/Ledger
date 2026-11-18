import { db, type ClothingItem, type PackLine, type Trip } from './db'
import { chatJSON, chatJSONWithSearch, type ChatTurn, type WebSource } from './gemini'
import { describeItemLine } from './closet'
import { addDays, friendlyDate } from './dates'

/** What the planner form collects. */
export interface TripInput {
  place: string
  startDate?: string
  nights: number
  occasions: string[]
  plans?: string
  weather?: string
}

interface PackReply {
  reply: string
  weather: string
  closet: { itemId: number; qty: number; note?: string | null }[]
  extras: { name: string; qty: number; buy: boolean; note?: string | null }[]
}

const STR = { type: 'STRING' }
const INT = { type: 'INTEGER' }

const PACK_SCHEMA = {
  type: 'OBJECT',
  propertyOrdering: ['reply', 'weather', 'closet', 'extras'],
  properties: {
    reply: { ...STR, description: 'One or two short sentences about the list (e.g. the plan for outfits, anything to watch for).' },
    weather: { ...STR, description: 'One short line: the weather this list is planned for, e.g. "Highs 45-50°F, rain likely". Say "typical" if it is a guess from the season.' },
    closet: {
      type: 'ARRAY',
      description: 'Clothing and accessories to pack, ONLY from his closet ids.',
      items: {
        type: 'OBJECT',
        properties: {
          itemId: INT,
          qty: { ...INT, description: 'Usually 1; more only if the closet entry clearly stands for several of the same thing' },
          note: { ...STR, nullable: true, description: 'Very short, e.g. "wear on the plane", "dinner Sat"' },
        },
        required: ['itemId', 'qty'],
      },
    },
    extras: {
      type: 'ARRAY',
      description: 'Everything else to bring that is not in the closet list: underwear, socks, sleepwear if not listed, toiletries, chargers, documents, trip-specific gear. Concise.',
      items: {
        type: 'OBJECT',
        properties: {
          name: STR,
          qty: INT,
          buy: { type: 'BOOLEAN', description: 'True only for clothing/gear the trip really needs that he does not own' },
          note: { ...STR, nullable: true },
        },
        required: ['name', 'qty', 'buy'],
      },
    },
  },
  required: ['reply', 'weather', 'closet', 'extras'],
}

function tripLines(t: TripInput): string {
  const end = t.startDate ? addDays(t.startDate, t.nights) : undefined
  return [
    `Destination: ${t.place}`,
    t.startDate ? `Dates: ${t.startDate} to ${end} (${t.nights} night${t.nights === 1 ? '' : 's'})` : `Length: ${t.nights} night${t.nights === 1 ? '' : 's'}, dates not set`,
    `Plans: ${[t.occasions.join(', '), t.plans?.trim()].filter(Boolean).join('; ') || 'not specified'}`,
    `Weather he expects: ${t.weather?.trim() || 'not given'}`,
  ].join('\n')
}

function systemPrompt(items: ClothingItem[]): string {
  const closet = items.length ? items.map(describeItemLine).join('\n') : '(empty)'
  return `You plan packing lists for one man's trips in a personal wardrobe app.

HIS CLOSET (id | category | name | attributes | notes):
${closet}

Rules:
- Clothing and accessories go in "closet" and must use ids from his closet. Never invent ids.
- Pack light but complete: plan outfits that mix and match across the days, and match the weather and every plan (e.g. gym → activewear, dinner out → something sharper). Include the outfit he travels in.
- Socks, underwear, toiletries, chargers, documents and anything not in his closet go in "extras" with sensible quantities for the number of nights. Keep extras to what this trip needs (about 8-15 lines).
- If a plan needs clothing he doesn't own (e.g. swim trunks for a beach trip), add it to "extras" with buy true.
- Weather: use what he gave. If web search results are provided, use the forecast or recent weather for those dates. Otherwise give typical weather for that place and month and say it's typical.`
}

function toLines(r: PackReply, items: ClothingItem[], previous?: PackLine[]): PackLine[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const wasPacked = new Set((previous ?? []).filter((l) => l.packed).map((l) => (l.itemId ? `#${l.itemId}` : l.name.toLowerCase())))
  const seen = new Set<number>()
  const lines: PackLine[] = []
  for (const c of r.closet ?? []) {
    const item = byId.get(c.itemId)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    lines.push({
      key: `c${item.id}`,
      itemId: item.id,
      category: item.category,
      name: item.name,
      qty: Math.max(1, Math.round(c.qty || 1)),
      note: c.note?.trim() || undefined,
      packed: wasPacked.has(`#${item.id}`),
    })
  }
  const names = new Set<string>()
  for (const [i, e] of (r.extras ?? []).entries()) {
    const name = e.name?.trim()
    if (!name || names.has(name.toLowerCase())) continue
    names.add(name.toLowerCase())
    lines.push({
      key: `x${Date.now().toString(36)}${i}`,
      name,
      qty: Math.max(1, Math.round(e.qty || 1)),
      buy: e.buy || undefined,
      note: e.note?.trim() || undefined,
      packed: wasPacked.has(name.toLowerCase()),
    })
  }
  return lines
}

async function ask(system: string, prompt: string, search: boolean): Promise<{ r: PackReply; sources?: WebSource[] }> {
  const turns: ChatTurn[] = [{ role: 'user', parts: [{ text: prompt }] }]
  if (search) {
    const out = await chatJSONWithSearch<PackReply>(system, turns, PACK_SCHEMA)
    return { r: out.result, sources: out.sources }
  }
  return { r: await chatJSON<PackReply>(system, turns, PACK_SCHEMA) }
}

function check(r: PackReply) {
  if (!r || !Array.isArray(r.closet) || !Array.isArray(r.extras)) throw new Error('Gemini sent a list in an unexpected format. Try again.')
}

/** Makes a new packing list and saves it. Returns the trip id. */
export async function planTrip(input: TripInput, opts: { search: boolean; items?: ClothingItem[] }): Promise<number> {
  const items = opts.items ?? (await db.clothes.toArray())
  const prompt = `Make my packing list.\n${tripLines(input)}${opts.search ? '\nLook up the weather forecast (or recent weather) for those dates and that place.' : ''}`
  const { r, sources } = await ask(systemPrompt(items), prompt, opts.search)
  check(r)
  const now = Date.now()
  return (await db.trips.add({
    ...input,
    place: input.place.trim(),
    plans: input.plans?.trim() || undefined,
    weather: r.weather?.trim() || input.weather?.trim() || undefined,
    summary: r.reply?.trim() || undefined,
    sources: sources?.length ? sources : undefined,
    lines: toLines(r, items),
    createdAt: now,
    updatedAt: now,
  } as Trip)) as number
}

/** Rewrites a list from a request like "fewer shoes" or "add a gym day". Packed checks are kept. */
export async function adjustTrip(trip: Trip, request: string, items?: ClothingItem[]): Promise<void> {
  const closet = items ?? (await db.clothes.toArray())
  const current = trip.lines
    .map((l) => `- ${l.itemId ? `#${l.itemId} ` : ''}${l.name} x${l.qty}${l.buy ? ' (to buy)' : ''}${l.note ? ` (${l.note})` : ''}`)
    .join('\n')
  const prompt = `${tripLines(trip)}\nWeather planned for: ${trip.weather ?? 'unknown'}\n\nCURRENT LIST:\n${current || '(empty)'}\n\nChange the list: ${request}\nReturn the whole updated list. Keep everything else the same unless the change needs it. Keep "weather" as is unless I said otherwise.`
  const { r } = await ask(systemPrompt(closet), prompt, false)
  check(r)
  const req = request.toLowerCase()
  // Only take a new weather line when the request is about the weather, so a
  // looked-up forecast isn't swapped for a guess.
  const aboutWeather = /weather|forecast|cold|colder|warm|warmer|hot|heat|rain|snow|wind|temp|degrees/.test(req)
  // Checks are copied from the list as saved now, in case some were ticked while waiting.
  await db.transaction('rw', db.trips, async () => {
    const latest = await db.trips.get(trip.id)
    if (!latest) return
    const lines = toLines(r, closet, latest.lines)
    // Things he typed in himself stay unless the request names them.
    const names = new Set(lines.map((l) => l.name.toLowerCase()))
    const keptManual = latest.lines.filter((l) => l.key.startsWith('m') && !names.has(l.name.toLowerCase()) && !req.includes(l.name.toLowerCase()))
    await db.trips.update(trip.id, {
      lines: [...lines, ...keptManual],
      summary: r.reply?.trim() || latest.summary,
      weather: aboutWeather ? r.weather?.trim() || latest.weather : latest.weather,
      updatedAt: Date.now(),
    })
  })
}

/**
 * Changes a trip's lines starting from what's saved right now, inside a
 * transaction, so quick taps in a row each build on the last one.
 */
export function editLines(id: number, change: (lines: PackLine[]) => PackLine[]): Promise<void> {
  return db.transaction('rw', db.trips, async () => {
    const t = await db.trips.get(id)
    if (t) await db.trips.update(id, { lines: change(t.lines), updatedAt: Date.now() })
  })
}

export function tripDates(t: Pick<Trip, 'startDate' | 'nights'>): string {
  const n = `${t.nights} night${t.nights === 1 ? '' : 's'}`
  if (!t.startDate) return n
  return `${friendlyDate(t.startDate)} – ${friendlyDate(addDays(t.startDate, t.nights))} · ${n}`
}

export const packedCount = (t: Trip) => {
  const total = t.lines.length
  const done = t.lines.filter((l) => l.packed).length
  return { total, done }
}
