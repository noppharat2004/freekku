'use client';
// lib/supabaseImageLoader.ts
// ---------------------------------------------------------------
// Custom Next.js image loader for Supabase Storage.
//
// Supabase Storage supports on-the-fly image transformation via
// query parameters documented at:
// https://supabase.com/docs/guides/storage/image-transformations
//
// Next.js passes { src, width, quality } to this function.
// We append those as ?width=&quality= so Supabase returns a
// resized, WebP-converted image instead of the raw upload.
//
// IMPORTANT: The 'use client' directive is required here because
// Next.js loader files must be Client Components (they serialize
// a function) — per the Next.js 16 docs.
// ---------------------------------------------------------------

interface LoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

export default function supabaseImageLoader({ src, width, quality }: LoaderArgs): string {
  const url = new URL(src);
  url.searchParams.set('width', width.toString());
  url.searchParams.set('quality', (quality ?? 75).toString());
  return url.href;
}
