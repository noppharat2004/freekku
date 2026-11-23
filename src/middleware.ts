// src/middleware.ts
// ---------------------------------------------------------------
// Edge Middleware — runs before every request.
//
// Responsibilities:
//   1. Security HTTP headers (CSP, HSTS, X-Frame-Options, …)
//   2. In-memory rate limiting per IP for mutation endpoints
//      (Server Actions are POST to / so we key on X-Invoke-Action)
// ---------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';

// ── Rate-limit store (edge in-memory, resets per isolate cold-start) ──
// Key: `${ip}:${action}` → { count, windowStart }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  createOffering:   { max: 5,  windowMs: 60_000 },   // 5 posts / minute
  markOutOfStock:   { max: 10, windowMs: 60_000 },   // 10 reports / minute
};

function checkRateLimit(ip: string, action: string): boolean {
  const rule = RATE_LIMITS[action];
  if (!rule) return true; // unknown actions are not rate-limited here

  const key = `${ip}:${action}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > rule.windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= rule.max) return false;

  entry.count++;
  return true;
}

// ── Supabase Storage origin (populated from env at request time) ──
function getSupabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try { return new URL(url).origin; } catch { return ''; }
}

// ── Build Content-Security-Policy ────────────────────────────
function buildCSP(supabaseOrigin: string): string {
  const isDev = process.env.NODE_ENV === 'development';

  // React (Turbopack/webpack) uses eval() in dev mode for source maps.
  // 'unsafe-eval' is removed in production — never needed there.
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
    : "'self' 'unsafe-inline' https://challenges.cloudflare.com";

  const directives: Record<string, string> = {
    'default-src':     "'self'",
    'script-src':      scriptSrc,
    'style-src':       "'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src':        "'self' https://fonts.gstatic.com",
    'img-src':         `'self' data: blob: ${supabaseOrigin}`,
    'connect-src':     `'self' ${supabaseOrigin} wss://${new URL(supabaseOrigin || 'https://x.supabase.co').host} https://challenges.cloudflare.com`,
    'frame-src':       "https://challenges.cloudflare.com",
    'object-src':      "'none'",
    'base-uri':        "'self'",
    'form-action':     "'self'",
    'frame-ancestors': "'none'",
    // upgrade-insecure-requests breaks localhost (HTTP) in dev
    ...(isDev ? {} : { 'upgrade-insecure-requests': '' }),
  };

  return Object.entries(directives)
    .map(([k, v]) => v ? `${k} ${v}` : k)
    .join('; ');
}

// ── Security headers applied to every response ───────────────
function applySecurityHeaders(res: NextResponse, supabaseOrigin: string): void {
  const h = res.headers;

  h.set('Content-Security-Policy',   buildCSP(supabaseOrigin));
  h.set('X-Frame-Options',           'DENY');
  h.set('X-Content-Type-Options',    'nosniff');
  h.set('Referrer-Policy',           'strict-origin-when-cross-origin');
  h.set('X-DNS-Prefetch-Control',    'off');
  h.set('X-Download-Options',        'noopen');
  h.set('X-Permitted-Cross-Domain-Policies', 'none');

  // HSTS — only set on HTTPS (Vercel / production)
  h.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );

  // Lock down what browser features this page can use
  h.set(
    'Permissions-Policy',
    'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()'
  );
}

// ── Middleware entry point ────────────────────────────────────
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Detect Server Action calls: Next.js sends them as POST to the page route
  // with a `Next-Action` header containing the action ID.
  const actionHeader = req.headers.get('next-action');
  const isServerAction = req.method === 'POST' && !!actionHeader;

  // ── Rate limiting for Server Actions ─────────────────────
  if (isServerAction) {
    // Derive action name from the content — we map known action IDs in .env
    // For simplicity, we rate-limit ALL Server Action POSTs together per IP
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    // Parse the action name hint from query string (?_action=createOffering)
    const actionName = req.nextUrl.searchParams.get('_action') ?? 'unknown';

    if (!checkRateLimit(ip, actionName)) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please slow down.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        }
      );
    }
  }

  // ── Block direct access to internal API paths ─────────────
  if (pathname.startsWith('/api/_')) {
    return new NextResponse(null, { status: 404 });
  }

  const res = NextResponse.next();
  applySecurityHeaders(res, getSupabaseOrigin());
  return res;
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
