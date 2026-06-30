'use client';
// components/StatusBadge.tsx
// ---------------------------------------------------------------
// Visual badge showing current offering status with emoji + label.
// ---------------------------------------------------------------
import { STATUS_CONFIG } from '@/lib/constants';
import { OfferingStatus } from '@/lib/database.types';

interface StatusBadgeProps {
  status: OfferingStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClass} ${config.badge}`}
      role="status"
      aria-label={`สถานะ: ${config.label}`}
    >
      <span aria-hidden="true">{config.emoji}</span>
      {config.label}
    </span>
  );
}
