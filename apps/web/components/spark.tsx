'use client';
export function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => (v == null ? null : [i * (100 / Math.max(1, values.length - 1)), 30 - (v / 100) * 28] as const)).filter(Boolean) as (readonly [number, number])[];
  if (pts.length < 2) return null;
  return <svg viewBox="0 0 100 32" className="w-full h-8 text-accent flip-rtl" aria-hidden="true"><polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts.map((p) => p.join(',')).join(' ')} /></svg>;
}
