import { saveStaples } from '../../meals'
import type { MealsData } from '../../useMealsData'
import EditableList from '../../components/EditableList'

export default function Staples({ data }: { data: MealsData }) {
  return (
    <EditableList
      title="Staples"
      description="Foods you always have on hand. The Meal Maker builds recipes around these first."
      items={data.staples}
      onChange={(next) => void saveStaples(next)}
      placeholder="e.g. eggs, rice, chicken breast, olive oil"
      emptyText="No staples yet. Add what's always in your kitchen, or tell the Meal Maker."
      tone="green"
      maxHeight="max-h-[55vh]"
    />
  )
}
