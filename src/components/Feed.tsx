'use client';
// components/Feed.tsx
// ---------------------------------------------------------------
// Core feed component.
// - Fetches the last 12 hours of offerings on mount.
// - Subscribes to Supabase Realtime for instant INSERT/UPDATE events.
// - Sorts: active posts first (by time), out-of-stock posts at the bottom.
// - Renders skeleton cards while loading.
// ---------------------------------------------------------------
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Offering } from '@/lib/database.types';
import { FEED_HOURS } from '@/lib/constants';
import OfferingCard from './OfferingCard';
import SkeletonCard from './SkeletonCard';
import { PackageOpen, Wifi, WifiOff } from 'lucide-react';

export default function Feed() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);

  /* ── Sort helper: active posts first, OutOfStock last ────── */
  const sortOfferings = useCallback((items: Offering[]): Offering[] => {
    return [...items].sort((a, b) => {
      const aOut = a.status === 'OutOfStock';
      const bOut = b.status === 'OutOfStock';
      if (aOut !== bOut) return aOut ? 1 : -1; // out-of-stock sinks to bottom
      // Within the same bucket, newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, []);

  /* ── Initial fetch ─────────────────────────────────────── */
  useEffect(() => {
    async function fetchOfferings() {
      setLoading(true);

      const since = new Date(Date.now() - FEED_HOURS * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('offerings')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Fetch error:', error);
      } else {
        setOfferings(sortOfferings(data ?? []));
      }
      setLoading(false);
    }

    fetchOfferings();
  }, [sortOfferings]);

  /* ── Realtime subscription ─────────────────────────────── */
  useEffect(() => {
    const channel = supabase
      .channel('offerings-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'offerings' },
        (payload) => {
          // A new offering was posted — add to top of feed
          setOfferings((prev) =>
            sortOfferings([payload.new as Offering, ...prev])
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'offerings' },
        (payload) => {
          // Status was updated — merge update, re-sort
          setOfferings((prev) =>
            sortOfferings(
              prev.map((o) =>
                o.id === payload.new.id ? (payload.new as Offering) : o
              )
            )
          );
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sortOfferings]);

  /* ── Render ─────────────────────────────────────────────── */

  // Loading state — show 4 skeleton cards
  if (loading) {
    return (
      <div className="space-y-4 pb-28">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (offerings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <PackageOpen className="w-16 h-16 text-stone-200" aria-hidden="true" />
        <h2 className="text-stone-500 font-semibold text-lg">ยังไม่มีของแจกตอนนี้</h2>
        <p className="text-stone-400 text-sm max-w-xs">
          เมื่อมีคนแจก จะขึ้นที่นี่ทันที!<br />
          ลองกดปุ่มด้านล่างเพื่อโพสต์ของแจกของคุณ 😊
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Realtime connectivity indicator */}
      <div
        className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full w-fit transition-all duration-300 ${
          isConnected
            ? 'text-emerald-600 bg-emerald-50'
            : 'text-amber-600 bg-amber-50'
        }`}
        role="status"
        aria-live="polite"
      >
        {isConnected ? (
          <>
            <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
            <span>อัพเดทแบบเรียลไทม์</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
            <span>กำลังเชื่อมต่อใหม่...</span>
          </>
        )}
      </div>

      {/* Offering cards */}
      {offerings.map((offering) => (
        <OfferingCard key={offering.id} offering={offering} />
      ))}
    </div>
  );
}
