'use client';
// components/OfferingCard.tsx
// ---------------------------------------------------------------
// Displays a single offering post.
// - Shows image, location, note, time ago, and current status.
// - Provides crowdsourced status update buttons.
// - Dims the card when status is "OutOfStock".
// ---------------------------------------------------------------
import Image from 'next/image';
import { useState } from 'react';
import { MapPin, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { STATUS_CONFIG } from '@/lib/constants';
import { Offering, OfferingStatus } from '@/lib/database.types';
import StatusBadge from './StatusBadge';

interface OfferingCardProps {
  offering: Offering;
}

/** Returns a human-friendly "X minutes ago" string */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'เพิ่งโพสต์';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} ชั่วโมงที่แล้ว`;
}

export default function OfferingCard({ offering }: OfferingCardProps) {
  const [updating, setUpdating] = useState(false);
  const config = STATUS_CONFIG[offering.status as OfferingStatus];
  const isOutOfStock = offering.status === 'OutOfStock';

  /** Advances status to the next state in the chain */
  async function handleStatusUpdate() {
    if (!config.next || updating) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('offerings')
        .update({ status: config.next })
        .eq('id', offering.id);
      if (error) throw error;
      // Note: UI update is handled by the Realtime subscription in Feed
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('อัพเดทสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <article
      className={`card animate-fade-in transition-opacity duration-300 ${
        isOutOfStock ? 'opacity-50' : 'opacity-100'
      }`}
      aria-label={`ของแจก ณ ${offering.location}`}
    >
      {/* ── Offering Image ─────────────────────────────────── */}
      <div className="relative w-full h-52 bg-stone-100">
        <Image
          src={offering.image_url}
          alt={`ของแจกที่ ${offering.location}`}
          fill
          className="object-cover"
          sizes="(max-width: 512px) 100vw, 512px"
          priority={false}
        />

        {/* Gradient overlay for status badge visibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Status badge overlay — bottom left of image */}
        <div className="absolute bottom-3 left-3">
          <StatusBadge status={offering.status as OfferingStatus} />
        </div>
      </div>

      {/* ── Card Body ──────────────────────────────────────── */}
      <div className="p-4 space-y-3">

        {/* Location row */}
        <div className="flex items-center gap-2 text-stone-700">
          <MapPin className="w-4 h-4 text-shrine flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold text-base">{offering.location}</span>
        </div>

        {/* Note (optional) */}
        {offering.note && (
          <p className="text-stone-600 text-sm leading-relaxed line-clamp-3">
            {offering.note}
          </p>
        )}

        {/* Timestamp */}
        <div className="flex items-center gap-1.5 text-stone-400 text-xs">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <time dateTime={offering.created_at}>{timeAgo(offering.created_at)}</time>
        </div>

        {/* ── Status Update Button ─────────────────────────── */}
        {config.next ? (
          <button
            id={`status-btn-${offering.id}`}
            onClick={handleStatusUpdate}
            disabled={updating}
            className="mt-1 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-stone-200
                       py-2.5 px-4 text-sm font-semibold text-stone-600
                       hover:border-stone-300 hover:bg-stone-50
                       active:scale-95 transition-all duration-150 touch-manipulation
                       disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label={`อัพเดทสถานะเป็น ${config.nextLabel}`}
          >
            {updating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>กำลังอัพเดท...</span>
              </>
            ) : (
              <>
                <span>
                  {STATUS_CONFIG[config.next].emoji}{' '}
                  อัพเดทเป็น&nbsp;<strong>{config.nextLabel}</strong>
                </span>
                <ChevronRight className="w-4 h-4 ml-auto" aria-hidden="true" />
              </>
            )}
          </button>
        ) : (
          /* Out of stock — no button, just a dimmed info pill */
          <div className="mt-1 w-full text-center py-2 rounded-xl bg-rose-50 text-rose-500 text-sm font-medium">
            🔴 หมดแล้ว — ขอบคุณทุกคนที่รับไป!
          </div>
        )}
      </div>
    </article>
  );
}
