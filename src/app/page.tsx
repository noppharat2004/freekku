'use client';
// app/page.tsx
// ---------------------------------------------------------------
// Main page — the live offering board.
// Renders: App header, Feed, and the FAB to create new posts.
// ---------------------------------------------------------------
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Bell, Plus, Info } from 'lucide-react';
import Feed from '@/components/Feed';

// Lazy-load the modal — it's only needed when user taps FAB
const NewPostModal = dynamic(() => import('@/components/NewPostModal'), {
  loading: () => null,
});

export default function HomePage() {
  const [showModal, setShowModal] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      {/* ── Sticky Header ──────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #b94a3c, #d4735c)' }}
              aria-hidden="true"
            >
              🏮
            </div>
            <div>
              <h1 className="text-base font-bold text-stone-800 leading-tight">
                สวัสดิการเจ้าพ่อมอ
              </h1>
              <p className="text-xs text-stone-400 leading-none">บอร์ดเรียลไทม์</p>
            </div>
          </div>

          {/* Info button */}
          <button
            id="info-btn"
            onClick={() => setShowInfo((v) => !v)}
            className="p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-500"
            aria-label="กฎการใช้งาน"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>

        {/* Info panel (collapsible) */}
        {showInfo && (
          <div
            role="region"
            aria-label="กฎการใช้งาน"
            className="px-4 pb-3 animate-fade-in border-t border-stone-100"
          >
            <div className="mt-2 rounded-xl bg-shrine-light px-4 py-3 text-sm text-stone-700 space-y-1.5">
              <p className="font-semibold" style={{ color: 'var(--color-shrine-primary)' }}>
                📜 กฎกติกา
              </p>
              <ul className="space-y-1 list-disc list-inside text-stone-600">
                <li>รับเองที่จุดแจก <strong>เท่านั้น</strong></li>
                <li><strong>1 คน ต่อ 1 ชิ้น</strong> — แบ่งปันกัน</li>
                <li>ช่วยอัพเดทสถานะหลังรับของ</li>
                <li>โพสต์จะหมดอายุอัตโนมัติใน 12 ชม.</li>
              </ul>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="px-4 pt-5">

        {/* Section title */}
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4" style={{ color: 'var(--color-shrine-primary)' }} aria-hidden="true" />
          <h2 className="text-sm font-bold text-stone-500 uppercase tracking-wider">
            ของแจกล่าสุด (12 ชม.)
          </h2>
        </div>

        {/* Live feed */}
        <Feed />
      </main>

      {/* ── Floating Action Button ─────────────────────────── */}
      <div className="fixed bottom-6 right-4 z-40 max-w-lg w-full pointer-events-none"
           style={{ left: '50%', transform: 'translateX(-50%)', maxWidth: '512px' }}>
        <div className="flex justify-end pr-4 pointer-events-auto">
          <button
            id="fab-new-post"
            onClick={() => setShowModal(true)}
            className="fab-pulse flex items-center gap-2.5 py-4 px-6 rounded-2xl text-white font-bold text-sm
                       shadow-xl shadow-shrine/40 active:scale-95 transition-all duration-150 touch-manipulation"
            style={{ background: 'linear-gradient(135deg, #b94a3c, #d4735c)' }}
            aria-label="แจ้งของแจกใหม่"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
            <span>แจ้งของแจก</span>
          </button>
        </div>
      </div>

      {/* ── New Post Modal ─────────────────────────────────── */}
      {showModal && <NewPostModal onClose={() => setShowModal(false)} />}
    </>
  );
}
