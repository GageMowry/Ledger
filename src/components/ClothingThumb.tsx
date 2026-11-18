import type { ClothingItem } from '../db'
import { CATEGORY_BY_KEY } from '../closet'

// One object URL per photo Blob, made the first time it's drawn and reused
// after that, so a tile shows its photo on the very first paint instead of
// flashing a placeholder. The URL is released once the Blob is no longer used.
const urls = new WeakMap<Blob, string>()
const registry =
  typeof FinalizationRegistry === 'function' ? new FinalizationRegistry<string>((url) => URL.revokeObjectURL(url)) : null

export function photoURL(blob: Blob): string {
  let url = urls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    urls.set(blob, url)
    registry?.register(blob, url)
  }
  return url
}

/** Square photo, or a soft placeholder with the category icon. */
export default function ClothingThumb({ item, className = '' }: { item: Pick<ClothingItem, 'photo' | 'category' | 'name'>; className?: string }) {
  return (
    <div className={`relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}>
      {item.photo ? (
        <img
          src={photoURL(item.photo)}
          alt={item.name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl opacity-60" aria-hidden="true">
          {CATEGORY_BY_KEY[item.category]?.icon ?? '👕'}
        </div>
      )}
    </div>
  )
}
