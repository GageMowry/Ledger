import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { getPrefs, getStaples, getTargets, getTimeLimit } from './meals'

/** Everything the Meals screens need, live from the on-device database. */
export function useMealsData() {
  return useLiveQuery(async () => {
    const [meals, prefs, targets, timeLimit, staples] = await Promise.all([
      db.meals.toArray(),
      getPrefs(),
      getTargets(),
      getTimeLimit(),
      getStaples(),
    ])
    meals.sort((a, b) => a.name.localeCompare(b.name))
    return { meals, prefs, targets, timeLimit, staples }
  })
}

export type MealsData = NonNullable<ReturnType<typeof useMealsData>>
