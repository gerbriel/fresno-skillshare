import {
  Baby,
  Bike,
  BookOpen,
  Camera,
  Car,
  Carrot,
  Dog,
  GraduationCap,
  Hammer,
  HeartHandshake,
  Home,
  Laptop,
  Leaf,
  Music,
  Package,
  Palette,
  Repeat,
  Scissors,
  Shirt,
  Sprout,
  Utensils,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Curated registry of category icons. Categories store a kebab-case lucide
 * icon name in `categories.icon`; keys here must match that convention.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  repeat: Repeat,
  wrench: Wrench,
  carrot: Carrot,
  'graduation-cap': GraduationCap,
  palette: Palette,
  laptop: Laptop,
  car: Car,
  package: Package,
  hammer: Hammer,
  sprout: Sprout,
  utensils: Utensils,
  music: Music,
  camera: Camera,
  scissors: Scissors,
  shirt: Shirt,
  baby: Baby,
  dog: Dog,
  bike: Bike,
  'book-open': BookOpen,
  'heart-handshake': HeartHandshake,
  home: Home,
  leaf: Leaf,
}

export function CategoryIcon({
  name,
  className,
}: {
  name?: string | null
  className?: string
}) {
  const Icon = (name && CATEGORY_ICONS[name]) || Repeat
  return <Icon className={className} aria-hidden />
}
