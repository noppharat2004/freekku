'use client';
// components/NewPostModal.tsx
// ---------------------------------------------------------------
// Bottom-sheet modal for creating a new offering post.
// Handles: image file selection + preview, location picker,
//          optional note, GPS capture, image compression,
//          image upload to Supabase Storage, Cloudflare Turnstile
//          verification, and row insert via a Server Action.
// ---------------------------------------------------------------
import { useState, useRef, useCallback } from 'react';
import { X, ImagePlus, MapPin, FileText, Loader2, CheckCircle2, LocateFixed } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { Turnstile } from '@marsidev/react-turnstile';
import { supabase } from '@/lib/supabase';
import { LOCATIONS } from '@/lib/constants';
import { createOffering } from '@/app/actions';

interface NewPostModalProps {
  onClose: () => void;
}

type FormStep = 'form' | 'locating' | 'compressing' | 'uploading' | 'success';

export default function NewPostModal({ onClose }: NewPostModalProps) {
  /* ── Form State ─────────────────────────────────────────── */
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [location, setLocation] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [step, setStep] = useState<FormStep>('form');
  const [error, setError] = useState<string | null>(null);

  // Turnstile token — set by the widget's onSuccess callback,
  // cleared on every error or expiry so we never reuse a stale token.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Image Selection ────────────────────────────────────── */
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate: images only, max 10 MB
      if (!file.type.startsWith('image/')) {
        setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('ขนาดไฟล์ต้องไม่เกิน 10 MB');
        return;
      }

      setError(null);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    },
    []
  );

  /* ── GPS helper ─────────────────────────────────────────── */
  /**
   * Returns the user's current GPS position, or null if the user
   * denies permission or the device has no GPS.
   * We never block the post on GPS failure — lat/lng are nullable
   * in the DB for exactly this reason.
   */
  function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        ()    => resolve(null),   // denied or error → continue without GPS
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 }
      );
    });
  }

  /* ── Form Submit ────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile || !location) return;

    // Guard: Turnstile must have resolved before submission
    if (!turnstileToken) {
      setError('กรุณารอการยืนยัน CAPTCHA ให้เสร็จก่อน');
      return;
    }

    setError(null);

    try {
      // 1. Get GPS coordinates (non-blocking — null if denied)
      setStep('locating');
      const gps = await getCurrentPosition();

      // 2. Compress image client-side before upload
      //    — max 800 × 800 px, under 300 KB, converted to WebP
      setStep('compressing');
      const compressed = await imageCompression(imageFile, {
        maxSizeMB: 0.3,          // 300 KB hard cap
        maxWidthOrHeight: 800,   // longest edge ≤ 800 px
        useWebWorker: true,      // non-blocking
        fileType: 'image/webp',  // always store as WebP
        initialQuality: 0.8,
      });

      setStep('uploading');

      // 3. Upload compressed image to Supabase Storage
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('offering-images')
        .upload(fileName, compressed, {
          contentType: 'image/webp',
          upsert: false,
        });

      if (uploadError) throw new Error(`อัพโหลดรูปล้มเหลว: ${uploadError.message}`);

      // 4. Get the public URL of the uploaded image
      const { data: urlData } = supabase.storage
        .from('offering-images')
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;

      // 5. Call the Server Action — verifies Turnstile, then inserts with GPS
      const result = await createOffering({
        imageUrl,
        location,
        note: note.trim() || null,
        turnstileToken,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
      });

      if (!result.success) {
        throw new Error(result.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }

      // 6. Show success screen briefly, then close
      setStep('success');
      setTimeout(onClose, 1800);

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      // Reset Turnstile so the user must solve it again
      setTurnstileToken(null);
      setStep('form');
    }
  }

  // Submit is only enabled when image, location, AND a valid token are present
  const canSubmit = !!imageFile && !!location && !!turnstileToken && step === 'form';

  /* ── Render ─────────────────────────────────────────────── */
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="แจ้งของแจกใหม่"
    >
      {/* Modal sheet */}
      <div className="animate-slide-up w-full max-w-lg mx-auto bg-white rounded-t-3xl max-h-[95dvh] overflow-y-auto">

        {/* ── Handle bar ─────────────────────────────────── */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-stone-200 rounded-full" />
        </div>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-lg font-bold text-stone-800">📢 แจ้งของแจก</h2>
          <button
            id="close-modal-btn"
            onClick={onClose}
            disabled={step !== 'form'}
            className="p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-500"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-8">

          {/* ── SUCCESS STATE ─────────────────────────────── */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 animate-fade-in">
              <CheckCircle2 className="w-16 h-16 text-emerald-500" />
              <p className="text-lg font-bold text-stone-800">โพสต์สำเร็จแล้ว! 🎉</p>
              <p className="text-stone-500 text-sm text-center">
                ของแจกของคุณขึ้นบอร์ดแล้ว<br />ขอบคุณที่แบ่งปัน ❤️
              </p>
            </div>
          )}

          {/* ── LOCATING STATE ────────────────────────────── */}
          {step === 'locating' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <LocateFixed className="w-12 h-12 text-shrine animate-pulse" />
              <p className="text-stone-600 font-medium">กำลังระบุตำแหน่ง GPS...</p>
              <p className="text-stone-400 text-xs text-center">
                ระบบจะบันทึกพิกัดไว้เพื่อตรวจสอบตอนแจ้งของหมด
              </p>
            </div>
          )}

          {/* ── COMPRESSING STATE ─────────────────────────── */}
          {step === 'compressing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-12 h-12 text-shrine animate-spin" />
              <p className="text-stone-600 font-medium">กำลังบีบอัดรูป...</p>
              <p className="text-stone-400 text-xs">ลดขนาดไฟล์เพื่อประหยัด Bandwidth</p>
            </div>
          )}

          {/* ── UPLOADING STATE ───────────────────────────── */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-12 h-12 text-shrine animate-spin" />
              <p className="text-stone-600 font-medium">กำลังอัพโหลด...</p>
            </div>
          )}

          {/* ── FORM STATE ────────────────────────────────── */}
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-700 text-sm"
                >
                  ⚠️ {error}
                </div>
              )}

              {/* ── Image Upload Area ─────────────────────── */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">
                  รูปภาพ <span className="text-rose-500">*</span>
                </label>

                <button
                  type="button"
                  id="image-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-2xl border-2 border-dashed transition-colors
                    flex flex-col items-center justify-center gap-2
                    ${imagePreview
                      ? 'border-shrine p-0 overflow-hidden aspect-video'
                      : 'border-stone-200 hover:border-shrine bg-stone-50 hover:bg-shrine-light py-10 px-4'
                    }`}
                  aria-label="เลือกรูปภาพ"
                >
                  {imagePreview ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={imagePreview}
                      alt="ตัวอย่างรูปที่เลือก"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <ImagePlus className="w-10 h-10 text-stone-300" aria-hidden="true" />
                      <span className="text-stone-500 text-sm text-center">
                        แตะเพื่อถ่ายรูป
                      </span>
                      <span className="text-stone-400 text-xs">JPG, PNG ขนาดไม่เกิน 10 MB</span>
                    </>
                  )}
                </button>

                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                    className="mt-2 text-xs text-stone-400 hover:text-rose-500 transition-colors"
                  >
                    ✕ เปลี่ยนรูป
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment" /* Lock to rear camera on mobile */
                  onChange={handleImageSelect}
                  className="sr-only"
                  aria-hidden="true"
                />
              </div>

              {/* ── Location Picker ───────────────────────── */}
              <div>
                <label
                  htmlFor="location-select"
                  className="block text-sm font-semibold text-stone-700 mb-2"
                >
                  <MapPin className="w-4 h-4 inline-block mr-1 text-shrine" aria-hidden="true" />
                  สถานที่ <span className="text-rose-500">*</span>
                </label>
                <select
                  id="location-select"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  className="w-full rounded-xl border-2 border-stone-200 bg-white px-4 py-3
                             text-stone-800 text-base
                             focus:outline-none focus:border-shrine transition-colors
                             appearance-none"
                >
                  <option value="" disabled>เลือกสถานที่...</option>
                  {LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* ── Optional Note ─────────────────────────── */}
              <div>
                <label
                  htmlFor="note-input"
                  className="block text-sm font-semibold text-stone-700 mb-2"
                >
                  <FileText className="w-4 h-4 inline-block mr-1 text-shrine" aria-hidden="true" />
                  หมายเหตุ <span className="text-stone-400 font-normal">(ไม่บังคับ)</span>
                </label>
                <textarea
                  id="note-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={200}
                  placeholder="เช่น ข้าวกล่อง 5 กล่อง วางไว้บนโต๊ะ..."
                  className="w-full rounded-xl border-2 border-stone-200 bg-white px-4 py-3
                             text-stone-800 text-sm resize-none
                             focus:outline-none focus:border-shrine transition-colors
                             placeholder:text-stone-300"
                />
                <p className="text-right text-xs text-stone-400 mt-1">
                  {note.length}/200
                </p>
              </div>

              {/* GPS notice */}
              <div className="flex items-start gap-2 text-xs text-stone-400 bg-stone-50 rounded-xl px-3 py-2.5">
                <LocateFixed className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-shrine" />
                <span>
                  ระบบจะขอตำแหน่ง GPS เมื่อกดโพสต์ เพื่อใช้ตรวจสอบตอนมีคนแจ้งของหมด
                  (ข้ามได้ถ้าปฏิเสธ)
                </span>
              </div>

              {/* ── Cloudflare Turnstile ───────────────────── */}
              <div className="flex justify-center">
                <Turnstile
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => {
                    setTurnstileToken(null);
                    setError('CAPTCHA โหลดไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ');
                  }}
                  options={{ theme: 'light', language: 'th' }}
                />
              </div>

              {/* ── Submit Button ─────────────────────────── */}
              <button
                id="submit-post-btn"
                type="submit"
                disabled={!canSubmit}
                className="w-full py-4 rounded-2xl text-white font-bold text-base
                           bg-shrine hover:bg-shrine-dark
                           disabled:opacity-40 disabled:cursor-not-allowed
                           active:scale-95 transition-all duration-150 touch-manipulation
                           shadow-md shadow-shrine/30"
                style={{ backgroundColor: 'var(--color-shrine-primary)' }}
              >
                📢 โพสต์เลย!
              </button>

              <p className="text-center text-xs text-stone-400">
                ⚠️ กฎ: 1 คน ต่อ 1 ชิ้น — รับเองเท่านั้น
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
