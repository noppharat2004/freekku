// lib/constants.ts
// ---------------------------------------------------------------
// Shared constants: locations and status definitions.
// ---------------------------------------------------------------

export const LOCATIONS = [
  'ศาลาฝั่งซ้าย',
  'ลานหน้าศาล',
  'ทางขึ้น',
  'ฝั่งขวาศาล',
  'ด้านหลังศาล',
] as const;

export type LocationType = typeof LOCATIONS[number];

export const STATUS_CONFIG = {
  Available: {
    label: 'ว่าง',
    emoji: '🟢',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    next: 'AlmostGone' as const,
    nextLabel: 'ใกล้หมด',
  },
  AlmostGone: {
    label: 'ใกล้หมด',
    emoji: '🟡',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    next: 'OutOfStock' as const,
    nextLabel: 'หมดแล้ว',
  },
  OutOfStock: {
    label: 'หมดแล้ว',
    emoji: '🔴',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    badge: 'bg-rose-100 text-rose-700',
    next: null,
    nextLabel: null,
  },
} as const;

/** How long (in hours) to show posts on the feed before hiding them */
export const FEED_HOURS = 12;
