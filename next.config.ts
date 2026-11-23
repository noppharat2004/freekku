// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './src/lib/supabaseImageLoader.ts',
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
    deviceSizes: [512, 768, 1080, 1200],
    imageSizes: [64, 128, 256, 512],
    formats: ['image/avif', 'image/webp'],
  },

  // Prevent exposing Next.js version in the X-Powered-By header
  poweredByHeader: false,

  // Enforce strict mode for catching React bugs early
  reactStrictMode: true,

  // Disallow embedding in iframes at the framework level as well
  // (also set in middleware via X-Frame-Options: DENY)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Belt-and-suspenders: middleware also sets these,
          // but Next.js headers() runs even when middleware is bypassed.
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
