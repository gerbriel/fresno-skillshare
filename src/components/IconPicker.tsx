import { CATEGORY_ICONS, CategoryIcon } from './CategoryIcon'

interface IconPickerProps {
  value: string
  onChange: (icon: string) => void
  label?: string
}

/** Grid of the curated category icons; used by the admin dashboard
 *  and the member "add a category" form. */
export function IconPicker({ value, onChange, label = 'Icon' }: IconPickerProps) {
  return (
    <div>
      <span className="block text-sm font-medium text-stone-700">{label}</span>
      <div role="group" aria-label={label} className="mt-1.5 grid grid-cols-8 gap-1.5">
        {Object.keys(CATEGORY_ICONS).map((key) => {
          const selected = key === value
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-label={key}
              aria-pressed={selected}
              title={key}
              className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
                selected
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
              }`}
            >
              <CategoryIcon name={key} className="h-4 w-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
