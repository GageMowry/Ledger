import { db, getSetting, setSetting, type ClothingCategory, type ClothingItem, type Outfit } from './db'
import { chatJSON, chatJSONWithSearch, type ChatTurn, type GeminiPart, type WebSource } from './gemini'
import { blobToBase64, bodyContext, describeItemLine } from './closet'

const STR = { type: 'STRING' }
const CATEGORY_ENUM = { type: 'STRING', enum: ['top', 'bottom', 'outerwear', 'shoes', 'accessory', 'activewear'] }

const ITEM_PROPS = {
  name: { ...STR, description: 'Short everyday name, e.g. "Navy oxford shirt"' },
  category: CATEGORY_ENUM,
  color: { ...STR, description: 'Main color(s), plain words' },
  pattern: { ...STR, description: 'e.g. solid, striped, plaid, graphic, heathered' },
  fit: { ...STR, description: 'e.g. slim, regular, relaxed, oversized, tapered, athletic' },
  description: { ...STR, description: '1-2 sentences: material/texture if visible, formality, and what it pairs well with' },
}
const ITEM_REQUIRED = ['name', 'category', 'color', 'pattern', 'fit', 'description']

export interface ItemFields {
  name: string
  category: ClothingCategory
  color: string
  pattern: string
  fit: string
  description: string
}

// ---------------------------------------------------------------- describe one item

export async function describeItem(item: Partial<ClothingItem>): Promise<ItemFields> {
  const known = [
    item.name && `name: ${item.name}`,
    item.category && `category: ${item.category}`,
    item.color && `color: ${item.color}`,
    item.pattern && `pattern: ${item.pattern}`,
    item.fit && `fit: ${item.fit}`,
    item.description && `current description: ${item.description}`,
  ]
    .filter(Boolean)
    .join('\n')
  const parts: GeminiPart[] = []
  if (item.photo) parts.push({ inlineData: { mimeType: 'image/jpeg', data: await blobToBase64(item.photo) } })
  parts.push({
    text: `Describe this clothing item for a men's wardrobe app.${item.photo ? ' Use the photo.' : ''}\n${known || '(no details yet)'}\nKeep the details the user already gave unless the photo clearly shows otherwise.`,
  })
  return chatJSON<ItemFields>(
    'You catalog clothing for one man\'s wardrobe. Be concrete and brief.',
    [{ role: 'user', parts }],
    { type: 'OBJECT', properties: ITEM_PROPS, required: ITEM_REQUIRED },
  )
}

// ---------------------------------------------------------------- find items in a photo

export interface DetectedItem extends ItemFields {
  box: number[] // [ymin, xmin, ymax, xmax], 0-1000
}

export async function detectItems(base64: string, note?: string): Promise<{ reply: string; items: DetectedItem[] }> {
  const r = await chatJSON<{ reply: string; items: DetectedItem[] }>(
    'You catalog clothing for one man\'s wardrobe from photos of him wearing it.',
    [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
          {
            text: `List each distinct clothing item and accessory the person is wearing (tops, bottoms, outerwear, shoes, watches, hats, belts, bags, glasses). Skip anything not clearly visible. For each, give a tight bounding box as [ymin, xmin, ymax, xmax] on a 0-1000 scale.${note ? `\nUser note: ${note}` : ''}\nIn "reply", one short sentence summarizing what you found.`,
          },
        ],
      },
    ],
    {
      type: 'OBJECT',
      properties: {
        reply: STR,
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { ...ITEM_PROPS, box: { type: 'ARRAY', items: { type: 'INTEGER' } } },
            required: [...ITEM_REQUIRED, 'box'],
          },
        },
      },
      required: ['reply', 'items'],
    },
  )
  return { reply: r.reply ?? '', items: (r.items ?? []).filter((i) => Array.isArray(i.box) && i.box.length === 4) }
}

// ---------------------------------------------------------------- stylist chat

export interface StylistOutfit {
  name: string
  occasion: string
  itemIds: number[]
  why: string
  addOns?: string[]
}

export interface StylistReply {
  reply: string
  outfit?: StylistOutfit | null
}

export interface DetectedForChat extends ItemFields {
  thumb: string // data URL of the cropped tile
  selected: boolean
}

export interface ClosetMessage {
  id: string
  role: 'user' | 'model'
  text: string
  prompt?: string
  photoNote?: boolean // user message that carried a photo
  reply?: StylistReply
  detected?: DetectedForChat[]
  addedIds?: number[]
  savedOutfitId?: number
  error?: boolean
  searched?: boolean
  sources?: WebSource[]
}

const STYLIST_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { ...STR, description: 'Short, friendly answer (1-3 sentences). Ask follow-ups here when needed.' },
    outfit: {
      type: 'OBJECT',
      nullable: true,
      description: 'One complete outfit built ONLY from the closet item ids; null when just chatting or asking questions.',
      properties: {
        name: { ...STR, description: 'Short name, e.g. "Smart casual Friday"' },
        occasion: STR,
        itemIds: { type: 'ARRAY', items: { type: 'INTEGER' } },
        why: { ...STR, description: '1-2 sentences on why it works, including fit for his build' },
        addOns: { type: 'ARRAY', items: STR, nullable: true, description: 'Optional items he does not own that would complete it' },
      },
      required: ['name', 'occasion', 'itemIds', 'why'],
    },
  },
  required: ['reply'],
}

export async function stylistSystemPrompt(items: ClothingItem[], outfits: Outfit[]): Promise<string> {
  const closet = items.length ? items.map(describeItemLine).join('\n') : '(empty)'
  const saved = outfits.length
    ? outfits.map((o) => `${o.name} (${o.occasion ?? 'any'}): ${o.itemIds.map((i) => `#${i}`).join(' ')}`).join('\n')
    : '(none)'
  return `You are the outfit Maker in a personal wardrobe app for one man.

HIS BODY: ${await bodyContext()}
Use his measurements to judge fit and proportion (e.g. broad shoulders vs. waist, inseam for pant length) and mention it briefly when relevant.

HIS CLOSET (id | category | name | attributes | notes):
${closet}

SAVED OUTFITS:
${saved}

How to answer:
- Build outfits ONLY from item ids in his closet. Never invent ids. A complete outfit usually has a top, bottoms and shoes; add outerwear or accessories when they help.
- Gym outfits should use activewear. Work, casual and going out should match their formality.
- If key info is missing (dress code, weather, vibe), ask up to 2 short questions in "reply" and set "outfit" to null.
- If he lacks something an outfit needs, build the best version from what he has and list what would complete it in "addOns".
- When asked what to buy or what's missing in his wardrobe, answer in "reply" and leave "outfit" null.
- Keep "reply" short; the app shows the outfit items as tiles.`
}

export function toTurns(messages: ClosetMessage[]): ChatTurn[] {
  return messages
    .filter((m) => !m.error)
    .map((m) => ({
      role: m.role,
      parts: [
        {
          text:
            m.role === 'model'
              ? m.reply
                ? JSON.stringify(m.reply)
                : m.text
              : (m.prompt ?? m.text),
        },
      ],
    }))
}

export async function askStylist(
  history: ClosetMessage[],
  prompt: string,
  opts?: { search?: boolean },
): Promise<{ reply: StylistReply; sources?: WebSource[] }> {
  const [items, outfits] = await Promise.all([db.clothes.toArray(), db.outfits.toArray()])
  const turns = [...toTurns(history.slice(-16)), { role: 'user' as const, parts: [{ text: prompt }] }]
  const system = await stylistSystemPrompt(items, outfits)
  let r: StylistReply
  let sources: WebSource[] | undefined
  if (opts?.search) {
    const out = await chatJSONWithSearch<StylistReply>(system, turns, STYLIST_SCHEMA)
    r = out.result
    sources = out.sources
  } else {
    r = await chatJSON<StylistReply>(system, turns, STYLIST_SCHEMA)
  }
  if (typeof r?.reply !== 'string') throw new Error('Gemini sent a reply in an unexpected format. Try again.')
  if (r.outfit) {
    const ids = new Set(items.map((i) => i.id))
    r.outfit.itemIds = [...new Set(r.outfit.itemIds.filter((id) => ids.has(id)))]
    if (!r.outfit.itemIds.length) r.outfit = null
  }
  return { reply: r, sources }
}

export async function saveOutfit(o: StylistOutfit): Promise<number> {
  return (await db.outfits.add({
    name: o.name,
    occasion: o.occasion,
    itemIds: o.itemIds,
    notes: o.why,
    source: 'ai',
    createdAt: Date.now(),
  } as Outfit)) as number
}

export const loadClosetChat = () => getSetting<ClosetMessage[]>('closetChat', [])
export const saveClosetChat = (m: ClosetMessage[]) => setSetting('closetChat', m.slice(-40))
