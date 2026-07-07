/** FIFA-card-style tier colors: gold for elite, green for quality, amber and
 *  below for squad filler. Backgrounds are translucent so badges sit well on
 *  cards and table rows alike. */
function ratingTier(v: number): string {
  if (v >= 85) return 'bg-gold/20 text-gold border-gold/40';
  if (v >= 75) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (v >= 65) return 'bg-lime-500/15 text-lime-300 border-lime-500/25';
  if (v >= 55) return 'bg-amber-500/15 text-amber-300 border-amber-500/25';
  if (v >= 45) return 'bg-orange-500/15 text-orange-300 border-orange-500/25';
  return 'bg-red-500/15 text-red-300 border-red-500/25';
}

export function Rating({ value, label }: { value: number; label?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2rem] px-1 rounded-md border
        font-display font-semibold text-[13px] leading-5 tabular-nums ${ratingTier(value)}`}
    >
      {value}
      {label && <span className="text-slate-500 text-[10px] ml-1 font-sans">{label}</span>}
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
      className="inline-flex items-center justify-center rounded-md font-display font-semibold text-white shrink-0 ring-1 ring-white/20"
      style={{
        backgroundColor: color,
        backgroundImage: 'linear-gradient(160deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 45%, rgba(0,0,0,0.28))',
        width: size,
        height: size,
        fontSize: size * 0.36,
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}
      title={abbrev}
    >
      {abbrev}
    </span>
  );
}
