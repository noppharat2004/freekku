'use client';
// components/OfferingCard.tsx
// ---------------------------------------------------------------
// Displays a single offering post.
// - Shows image, location, note, time ago, and current status.
// - Provides crowdsourced status update buttons.
//   · Available → AlmostGone: simple tap (no proof needed).
//   · AlmostGone → OutOfStock: requires:
//       1. Reporter's GPS (client-side)
//       2. Server-side Haversine check against the POST's stored lat/lng
//       3. Photo proof captured via rear camera
//       4. Compression + Supabase Storage upload
//       5. Server Action to persist status + proof URL
// - Dims the card when status is "OutOfStock".
// ---------------------------------------------------------------
import Image from 'next/image';
import { useState, useRef, useCallback } from 'react';
import { MapPin, Clock, ChevronRight, Loader2, Camera, X, ShieldAlert } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';
import { STATUS_CONFIG } from '@/lib/constants';
import { Offering, OfferingStatus } from '@/lib/database.types';
import { markOutOfStock } from '@/app/actions';
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

/** Returns "HH:MM น." in Thai locale, e.g. "14:30 น." */
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  }) + ' น.';
}

/** Returns "D MMM" in Thai, e.g. "7 ม.ค." */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Bangkok',
  });
}

// ── Step type for the OutOfStock modal ──────────────────────────
type ModalStep = 'locating' | 'capturing' | 'uploading' | 'done';

export default function OfferingCard({ offering }: OfferingCardProps) {
  /* ── Generic update state (Available → AlmostGone) ────────── */
  const [updating, setUpdating] = useState(false);

  /* ── OutOfStock proof modal state ─────────────────────────── */
  const [showProofModal, setShowProofModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('locating');
  const [modalError, setModalError] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  const proofInputRef = useRef<HTMLInputElement>(null);

  const config = STATUS_CONFIG[offering.status as OfferingStatus];
  const isOutOfStock = offering.status === 'OutOfStock';

  /* ── Simple status advance (Available → AlmostGone) ───────── */
  async function handleSimpleStatusUpdate() {
    if (!config.next || config.next === 'OutOfStock' || updating) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('offerings')
        .update({ status: config.next })
        .eq('id', offering.id);
      if (error) throw error;
      // Realtime subscription in Feed handles the UI update
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('อัพเดทสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUpdating(false);
    }
  }

  /* ── Start OutOfStock flow ─────────────────────────────────── */
  function startOutOfStockFlow() {
    setModalError(null);
    setProofPreview(null);
    setModalStep('locating');
    setShowProofModal(true);
    requestGeolocation();
  }

  /* ── Step 1: Get reporter's GPS, then hand off to server ─── */
  function requestGeolocation() {
    if (!navigator.geolocation) {
      setModalError('เบราว์เซอร์นี้ไม่รองรับ Geolocation');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // The actual Haversine distance check runs on the SERVER inside
        // markOutOfStock(), using the post's stored lat/lng.
        // We do a quick client-side pre-check only if the post has GPS stored,
        // to give the user faster feedback without a round-trip.
        if (offering.lat != null && offering.lng != null) {
          const R = 6_371_000;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(offering.lat - latitude);
          const dLng = toRad(offering.lng - longitude);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(latitude)) * Math.cos(toRad(offering.lat)) *
            Math.sin(dLng / 2) ** 2;
          const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

          const geofenceRadius = Number(process.env.NEXT_PUBLIC_GEOFENCE_RADIUS_M ?? 50);
          if (distM > geofenceRadius) {
            setModalError(
              `คุณต้องอยู่ใกล้บริเวณที่แจกของ (รัศมี ${geofenceRadius} เมตร) เพื่อแจ้งของหมด\n` +
              `ระยะห่างปัจจุบัน: ${Math.round(distM)} ม.`
            );
            return;
          }
        }

        // Pre-check passed (or post has no GPS) — proceed to camera
        // Store coords on the element so handleProofSelect can read them
        if (proofInputRef.current) {
          proofInputRef.current.dataset.reporterLat = String(latitude);
          proofInputRef.current.dataset.reporterLng = String(longitude);
        }
        setModalStep('capturing');
        setTimeout(() => proofInputRef.current?.click(), 100);
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้งในเบราว์เซอร์',
          2: 'ไม่สามารถระบุตำแหน่งได้ กรุณาลองใหม่',
          3: 'หมดเวลาขอตำแหน่ง กรุณาลองใหม่',
        };
        setModalError(messages[err.code] ?? 'เกิดข้อผิดพลาด Geolocation');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  }

  /* ── Step 2–5: Compress, upload, call server action ───────── */
  const handleProofSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setModalError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        return;
      }

      // Read the reporter coords that were stored in step 1
      const reporterLat = parseFloat(
        proofInputRef.current?.dataset.reporterLat ?? 'NaN'
      );
      const reporterLng = parseFloat(
        proofInputRef.current?.dataset.reporterLng ?? 'NaN'
      );

      if (isNaN(reporterLat) || isNaN(reporterLng)) {
        setModalError('ไม่พบข้อมูลตำแหน่ง กรุณาลองใหม่');
        setModalStep('locating');
        return;
      }

      setModalError(null);
      setProofPreview(URL.createObjectURL(file));
      setModalStep('uploading');

      try {
        /* Compress ─────────────────────────────────────────── */
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.2,          // 200 KB
          maxWidthOrHeight: 800,
          useWebWorker: true,
          fileType: 'image/webp',
          initialQuality: 0.8,
        });

        /* Upload to Supabase Storage (proofs bucket) ─────── */
        const fileName = `${offering.id}-${Date.now()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('proofs')
          .upload(fileName, compressed, {
            contentType: 'image/webp',
            upsert: false,
          });

        if (uploadError) throw new Error(`อัพโหลดรูปล้มเหลว: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from('proofs')
          .getPublicUrl(fileName);

        const proofImageUrl = urlData.publicUrl;

        /* Server Action — server-side Haversine + DB update ─ */
        const result = await markOutOfStock({
          offeringId: offering.id,
          proofImageUrl,
          reporterLat,
          reporterLng,
        });

        if (!result.success) throw new Error(result.error);

        setModalStep('done');
        setTimeout(() => setShowProofModal(false), 1500);

      } catch (err) {
        console.error('OutOfStock flow error:', err);
        setModalError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        setModalStep('capturing'); // let user retry photo
      }
    },
    [offering.id]
  );

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
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
            <time dateTime={offering.created_at}>
              {formatDate(offering.created_at)} · {formatTime(offering.created_at)}
              <span className="mx-1 text-stone-300">·</span>
              {timeAgo(offering.created_at)}
            </time>
          </div>

          {/* ── Status Update Button ──────────────────────────── */}
          {config.next ? (
            <button
              id={`status-btn-${offering.id}`}
              onClick={
                config.next === 'OutOfStock'
                  ? startOutOfStockFlow
                  : handleSimpleStatusUpdate
              }
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
            /* Out of stock — no button, just info pill */
            <div className="mt-1 w-full text-center py-2 rounded-xl bg-rose-50 text-rose-500 text-sm font-medium">
              🔴 หมดแล้ว
            </div>
          )}
        </div>
      </article>

      {/* ── Proof Modal ───────────────────────────────────────── */}
      {showProofModal && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="ยืนยันของหมด"
        >
          <div className="animate-slide-up w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
                <Camera className="w-5 h-5 text-rose-500" />
                ยืนยันของหมด — ถ่ายรูปหลักฐาน
              </h2>
              {modalStep !== 'uploading' && (
                <button
                  onClick={() => setShowProofModal(false)}
                  className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400"
                  aria-label="ปิด"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* ── locating step ── */}
            {modalStep === 'locating' && !modalError && (
              <div className="flex flex-col items-center py-6 gap-3 text-center">
                <Loader2 className="w-10 h-10 text-shrine animate-spin" />
                <p className="font-medium text-stone-700">กำลังตรวจสอบตำแหน่ง...</p>
                <p className="text-xs text-stone-400">
                  กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้ง
                </p>
              </div>
            )}

            {/* ── geofence / permission error ── */}
            {modalError && (
              <div className="flex flex-col items-center py-4 gap-4 text-center">
                <ShieldAlert className="w-12 h-12 text-rose-400" />
                <p className="text-rose-600 font-semibold text-sm whitespace-pre-line">
                  {modalError}
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => { setModalError(null); requestGeolocation(); }}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold
                               active:scale-95 transition-all"
                    style={{ backgroundColor: 'var(--color-shrine-primary)' }}
                  >
                    ลองใหม่
                  </button>
                  <button
                    onClick={() => setShowProofModal(false)}
                    className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 text-sm font-semibold
                               active:scale-95 transition-all"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {/* ── capturing step (geofence passed) ── */}
            {modalStep === 'capturing' && !modalError && (
              <div className="flex flex-col items-center py-4 gap-4 text-center">
                <div className="w-20 h-20 rounded-2xl bg-rose-50 flex items-center justify-center">
                  <Camera className="w-10 h-10 text-rose-400" />
                </div>
                <div>
                  <p className="font-semibold text-stone-800">ถ่ายรูปหลักฐาน</p>
                  <p className="text-xs text-stone-400 mt-1">
                    ถ่ายรูปบริเวณที่ของหมดแล้ว เพื่อยืนยัน
                  </p>
                </div>
                <button
                  onClick={() => proofInputRef.current?.click()}
                  className="w-full py-3 rounded-2xl text-white font-bold
                             active:scale-95 transition-all flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--color-shrine-primary)' }}
                >
                  <Camera className="w-5 h-5" />
                  เปิดกล้อง
                </button>
              </div>
            )}

            {/* ── uploading step ── */}
            {modalStep === 'uploading' && (
              <div className="flex flex-col items-center py-4 gap-4">
                {proofPreview && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={proofPreview}
                    alt="ภาพหลักฐาน"
                    className="w-full h-40 object-cover rounded-2xl"
                  />
                )}
                <Loader2 className="w-8 h-8 text-shrine animate-spin" />
                <p className="text-stone-600 font-medium text-sm">
                  กำลังบีบอัดและอัพโหลดรูปหลักฐาน...
                </p>
              </div>
            )}

            {/* ── done step ── */}
            {modalStep === 'done' && (
              <div className="flex flex-col items-center py-6 gap-3 text-center">
                <span className="text-5xl">✅</span>
                <p className="font-bold text-stone-800">บันทึกสำเร็จ!</p>
                <p className="text-stone-400 text-sm">สถานะอัพเดทเป็น &quot;หมดแล้ว&quot; แล้ว</p>
              </div>
            )}

            {/* Hidden camera-only file input — stores reporter coords in data attrs */}
            <input
              ref={proofInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleProofSelect}
              className="sr-only"
              aria-hidden="true"
            />
          </div>
        </div>
      )}
    </>
  );
}
