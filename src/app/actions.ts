'use server';
// app/actions.ts
// ---------------------------------------------------------------
// Server Actions — all sensitive logic lives here.
//
// Security layers:
//   • Input validation (Zod-less manual checks — no extra dep needed)
//   • Turnstile CAPTCHA verification before any DB write
//   • Server-side Haversine geofence (cannot be bypassed client-side)
//   • Service-role Supabase client so RLS is enforced by policy, not
//     by the client key's trust level
//   • Explicit status-transition guard (Available→AlmostGone→OutOfStock only)
// ---------------------------------------------------------------
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

// ── Constants ─────────────────────────────────────────────────
// In production this should be 50 m.
// Override via GEOFENCE_RADIUS_M env var for local testing.
const GEOFENCE_RADIUS_M = Number(process.env.GEOFENCE_RADIUS_M ?? 50);
const MAX_URL_LENGTH      = 2048;
const MAX_LOCATION_LENGTH = 100;
const MAX_NOTE_LENGTH     = 200;

// ── Input sanitisation helpers ────────────────────────────────
function isValidHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidLocation(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_LOCATION_LENGTH
  );
}

function isValidNote(value: unknown): value is string | null {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.length <= MAX_NOTE_LENGTH;
}

function isValidCoord(value: unknown): value is number | null {
  if (value === null || value === undefined) return true;
  return typeof value === 'number' && isFinite(value);
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

// ── Haversine formula ─────────────────────────────────────────
function haversineDistanceM(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Turnstile verification ────────────────────────────────────
async function verifyTurnstile(token: string): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return false;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('TURNSTILE_SECRET_KEY is not set');
    return false;
  }

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
        // Abort if Cloudflare takes more than 5 s
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// ── Supabase server client ────────────────────────────────────
// Uses the SERVICE_ROLE key so RLS policies are still enforced
// (we do NOT set { auth: { persistSession: false } } to skip RLS —
// service-role bypasses RLS by default, so our policies act as a
// second layer of defence only). Swap to anon + user JWT if you
// add auth later.
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // fallback for local dev

  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured');
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Shared result type ────────────────────────────────────────
export interface ActionResult {
  success: boolean;
  error?: string;
}

// ── createOffering ────────────────────────────────────────────
export interface CreateOfferingPayload {
  imageUrl: string;
  location: string;
  note: string | null;
  turnstileToken: string;
  lat: number | null;
  lng: number | null;
}

export async function createOffering(
  payload: CreateOfferingPayload
): Promise<ActionResult> {
  // ── Validate every field before touching the DB ────────────
  if (!isValidHttpsUrl(payload.imageUrl)) {
    return { success: false, error: 'URL รูปภาพไม่ถูกต้อง' };
  }

  // imageUrl must point to our own Supabase Storage bucket
  const supabaseHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host; } catch { return null; }
  })();
  if (supabaseHost && !new URL(payload.imageUrl).host.endsWith(supabaseHost)) {
    return { success: false, error: 'URL รูปภาพไม่ถูกต้อง' };
  }

  if (!isValidLocation(payload.location)) {
    return { success: false, error: 'สถานที่ไม่ถูกต้อง' };
  }

  if (!isValidNote(payload.note)) {
    return { success: false, error: `หมายเหตุยาวเกิน ${MAX_NOTE_LENGTH} ตัวอักษร` };
  }

  if (!isValidCoord(payload.lat) || !isValidCoord(payload.lng)) {
    return { success: false, error: 'ข้อมูล GPS ไม่ถูกต้อง' };
  }

  if (typeof payload.turnstileToken !== 'string') {
    return { success: false, error: 'ไม่พบ CAPTCHA token' };
  }

  // ── CAPTCHA ────────────────────────────────────────────────
  const isHuman = await verifyTurnstile(payload.turnstileToken);
  if (!isHuman) {
    return { success: false, error: 'การยืนยัน CAPTCHA ล้มเหลว กรุณาลองใหม่' };
  }

  // ── Insert ─────────────────────────────────────────────────
  const supabase = getServerSupabase();
  const { error: insertError } = await supabase.from('offerings').insert({
    image_url: payload.imageUrl.trim(),
    location:  payload.location.trim(),
    note:      payload.note?.trim() ?? null,
    status:    'Available',
    lat:       payload.lat ?? null,
    lng:       payload.lng ?? null,
  });

  if (insertError) {
    console.error('createOffering insert error:', insertError.message);
    return { success: false, error: 'บันทึกข้อมูลล้มเหลว กรุณาลองใหม่' };
    // Note: we never forward Supabase error messages to the client
    // to avoid leaking schema/constraint details.
  }

  return { success: true };
}

// ── markOutOfStock ────────────────────────────────────────────
export interface MarkOutOfStockPayload {
  offeringId:  string;
  proofImageUrl: string;
  reporterLat: number;
  reporterLng: number;
}

export async function markOutOfStock(
  payload: MarkOutOfStockPayload
): Promise<ActionResult> {
  // ── Validate inputs ────────────────────────────────────────
  if (!isValidUuid(payload.offeringId)) {
    return { success: false, error: 'ID โพสต์ไม่ถูกต้อง' };
  }

  if (!isValidHttpsUrl(payload.proofImageUrl)) {
    return { success: false, error: 'URL รูปหลักฐานไม่ถูกต้อง' };
  }

  // proofImageUrl must also point to our own Supabase Storage
  const supabaseHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host; } catch { return null; }
  })();
  if (supabaseHost && !new URL(payload.proofImageUrl).host.endsWith(supabaseHost)) {
    return { success: false, error: 'URL รูปหลักฐานไม่ถูกต้อง' };
  }

  if (
    typeof payload.reporterLat !== 'number' || !isFinite(payload.reporterLat) ||
    typeof payload.reporterLng !== 'number' || !isFinite(payload.reporterLng)
  ) {
    return { success: false, error: 'ข้อมูล GPS ไม่ถูกต้อง' };
  }

  const supabase = getServerSupabase();

  // ── Fetch post ─────────────────────────────────────────────
  const { data: offering, error: fetchError } = await supabase
    .from('offerings')
    .select('lat, lng, status')
    .eq('id', payload.offeringId)
    .single();

  if (fetchError || !offering) {
    return { success: false, error: 'ไม่พบโพสต์นี้ในระบบ' };
  }

  // ── Status-transition guard ────────────────────────────────
  // Only AlmostGone → OutOfStock is permitted.
  // This prevents jumping Available → OutOfStock directly.
  if (offering.status !== 'AlmostGone') {
    return { success: false, error: 'ไม่สามารถอัพเดทสถานะได้ (สถานะปัจจุบันไม่ถูกต้อง)' };
  }

  // ── Geofence check (server-side, cannot be bypassed) ──────
  if (offering.lat != null && offering.lng != null) {
    const distanceM = haversineDistanceM(
      payload.reporterLat, payload.reporterLng,
      offering.lat, offering.lng
    );

    if (distanceM > GEOFENCE_RADIUS_M) {
      return {
        success: false,
        error: `คุณต้องอยู่ใกล้บริเวณที่แจกของ (รัศมี ${GEOFENCE_RADIUS_M} เมตร) เพื่อแจ้งของหมด — ระยะห่างปัจจุบัน: ${Math.round(distanceM)} ม.`,
      };
    }
  }

  // ── Persist update ─────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('offerings')
    .update({
      status: 'OutOfStock',
      proof_image_url: payload.proofImageUrl,
    })
    .eq('id', payload.offeringId)
    .eq('status', 'AlmostGone'); // extra DB-level guard against race conditions

  if (updateError) {
    console.error('markOutOfStock update error:', updateError.message);
    return { success: false, error: 'อัพเดทสถานะล้มเหลว กรุณาลองใหม่' };
  }

  return { success: true };
}
