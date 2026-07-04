import { ratingColor } from '../format';

export function Rating({ value, label }: { value: number; label?: string }) {
  return (
    <span className={`font-mono font-semibold ${ratingColor(value)}`}>
      {value}
      {label && <span className="text-slate-500 text-xs ml-0.5">{label}</span>}
    </span>
  );
}

/** Filled crest placeholder — generic, recolorable (never a real logo, §9). */
export function CrestBadge({
  abbrev,
  color,
  size = 28,
}: {
  abbrev: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex items-center justify-center rounded font-bold text-white shrink-0"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        fontSize: size * 0.36,
      }}
      title={abbrev}
    >
      {abbrev}
    </span>
  );
}
