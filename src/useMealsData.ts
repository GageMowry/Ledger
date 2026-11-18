import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { getEquipment, getPrefs, getStaples, getStaplesOut, getTargets, getTimeLimit } from './meals'

/** Everything the Meals screens need, live from the on-device database. */
export function useMealsData() {
  return useLiveQuery(async () => {
    const [meals, prefs, targets, timeLimit, staples, staplesOut, equipment] = await Promise.all([
      db.meals.toArray(),
      getPrefs(),
      getTargets(),
      getTimeLimit(),
      getStaples(),
      getStaplesOut(),
      getEquipment(),
    ])
    meals.sort((a, b) => a.name.localeCompare(b.name))
    return { meals, prefs, targets, timeLimit, staples, staplesOut, equipment }
  })
}

export type MealsData = NonNullable<ReturnType<typeof useMealsData>>
