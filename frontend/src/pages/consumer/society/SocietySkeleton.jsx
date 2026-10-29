export default function SocietySkeleton() {
  return (
    <div
      className="pt-8 sm:pt-10 pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"
      role="status"
      aria-live="polite"
      aria-label="Loading society"
      data-testid="society-skeleton"
    >
      <div className="h-5 w-72 max-w-full skeleton rounded mb-5" />

      <div className="skeleton rounded-3xl h-56 sm:h-72 w-full mb-6" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rd-cell">
            <div className="h-3 w-16 skeleton rounded" />
            <div className="h-4 w-20 skeleton rounded mt-1.5" />
          </div>
        ))}
      </div>

      <div className="flex gap-1 sm:gap-2 border-b border-white/10 mb-6 overflow-hidden">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 w-24 skeleton rounded-t-lg flex-shrink-0" />)}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="h-48 skeleton rounded-2xl" />
          <div className="h-64 skeleton rounded-2xl" />
        </div>
        <div className="h-72 skeleton rounded-2xl" />
      </div>
    </div>
  );
}
