/** Inline line icons. Direction-implying icons (back, next, trend) flip in RTL via .flip-rtl (05 §2.4). */
import type { SVGProps } from 'react';

const P: Record<string, string> = {
  meal: 'M4 3v8a3 3 0 0 0 3 3v7M7 3v8M10 3v8a3 3 0 0 1-3 3M17 21V3c-2 1-3 4-3 7s1 4 3 4',
  stool: 'M7 18h10a3 3 0 0 0 .6-5.9A3 3 0 0 0 15 8.2 3 3 0 0 0 12 5a3 3 0 0 0-3 3.2A3 3 0 0 0 6.4 12.1 3 3 0 0 0 7 18z',
  symptom: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 15c1-1.3 2.3-2 4-2s3 .7 4 2M9 9.5h.01M15 9.5h.01',
  checkin: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  weight: 'M5 7h14l-1.5 13h-11zM9 7a3 3 0 0 1 6 0M12 11v3',
  body: 'M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 8h12M12 8v7M9 22l3-7 3 7',
  water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM7 10l7 7',
  supplement: 'M9 3h6v4H9zM7 7h10v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM7 12h10',
  exercise: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  note: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2 2M10 2h4',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  sync: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  offline: 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M16.9 10.6A10 10 0 0 1 19 12.9M2 8.8a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 8.8M12 20h.01',
  up: 'M12 19V5M5 12l7-7 7 7',
  today: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  timeline: 'M4 6h16M4 12h16M4 18h10',
  insights: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  warn: 'M12 3l10 18H2zM12 10v4M12 17h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  photo: 'M4 7h3l2-2h6l2 2h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  trial: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3',
  chevron: 'M6 9l6 6 6-6',
};
const FLIP = new Set(['back', 'next']);

export function Icon({ name, size = 22, className = '', ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  const d = P[name] ?? P.note!;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className={`${FLIP.has(name) ? 'flip-rtl' : ''} ${className}`} {...rest}><path d={d} /></svg>
  );
}

/** Bristol illustrations: abstract line drawings, clinical enough to be unambiguous (05 §4.3). */
export function BristolArt({ type, size = 44 }: { type: number; size?: number }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const };
  const shapes: Record<number, React.ReactNode> = {
    1: <>{[[10, 20], [22, 14], [34, 22], [16, 32], [30, 34]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4.5} {...s} />)}</>,
    2: <><path d="M6 24c0-5 4-8 8-8s5 3 9 3 5-3 9-3 8 3 8 8-4 8-8 8-5-3-9-3-5 3-9 3-8-3-8-8z" {...s} /><path d="M14 19v10M23 20v8M32 19v10" {...s} /></>,
    3: <><path d="M6 24c0-5 3-8 8-8h16c5 0 8 3 8 8s-3 8-8 8H14c-5 0-8-3-8-8z" {...s} /><path d="M14 17l2 3M22 16l1 3M30 17l-1 3M17 31l1-3M26 32l-1-3" {...s} /></>,
    4: <path d="M6 24c0-5 3-8 8-8h16c5 0 8 3 8 8s-3 8-8 8H14c-5 0-8-3-8-8z" {...s} />,
    5: <>{[[12, 18], [28, 16], [18, 30], [32, 30]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={6} ry={4.5} {...s} />)}</>,
    6: <path d="M7 26c2-6 6-3 8-7s5-2 7 1 6-3 8 0 6 4 4 8-6 3-9 4-7-1-10 0-9 0-8-6z" {...s} strokeDasharray="3 2" />,
    7: <><path d="M6 20c4-3 8 3 12 0s8-3 12 0 6 2 8 1" {...s} /><path d="M6 28c4-3 8 3 12 0s8-3 12 0 6 2 8 1" {...s} /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 44 44">{shapes[type]}</svg>;
}
