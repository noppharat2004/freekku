// components/SkeletonCard.tsx
// ---------------------------------------------------------------
// Placeholder skeleton shown while offerings are loading.
// Matches the visual structure of OfferingCard.
// ---------------------------------------------------------------
export default function SkeletonCard() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      {/* Image placeholder */}
      <div className="skeleton h-52 w-full rounded-none" />

      <div className="p-4 space-y-3">
        {/* Status badge placeholder */}
        <div className="skeleton h-6 w-24 rounded-full" />

        {/* Location line */}
        <div className="flex items-center gap-2">
          <div className="skeleton h-4 w-4 rounded-full" />
          <div className="skeleton h-4 w-32 rounded" />
        </div>

        {/* Note placeholder */}
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />

        {/* Button placeholder */}
        <div className="skeleton h-10 w-full rounded-lg mt-2" />
      </div>
    </div>
  );
}
