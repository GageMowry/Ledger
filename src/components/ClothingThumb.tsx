import { useEffect, useState } from 'react'
import type { ClothingItem } from '../db'
import { CATEGORY_BY_KEY } from '../closet'

/** Object URL for a Blob, revoked when it changes or unmounts. */
export function useObjectURL(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** Square photo, or a soft placeholder with the category icon. */
export default function ClothingThumb({ item, className = '' }: { item: Pick<ClothingItem, 'photo' | 'category' | 'name'>; className?: string }) {
  const url = useObjectURL(item.photo)
  return (
    <div className={`relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}>
      {url ? (
        <img src={url} alt={item.name} className="h-full w-full object-cover" loading="lazy" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl opacity-60" aria-hidden="true">
          {CATEGORY_BY_KEY[item.category]?.icon ?? '👕'}
        </div>
      )}
    </div>
  )
}
