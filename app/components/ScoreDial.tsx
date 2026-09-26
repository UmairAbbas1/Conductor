export function scoreColor(score: number) {
  return score >= 75 ? "var(--color-good)" : score >= 45 ? "var(--color-warn)" : "var(--color-bad)";
}

/** A 270° arc dial. */
export function ScoreDial({ score, size = 220, label = "Harmony" }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const filled = arc * (score / 100);
  const color = scoreColor(score);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[135deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={10} strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${filled} ${c}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${color})`, transition: "stroke-dasharray 800ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display leading-none" style={{ fontSize: size * 0.34, color }}>{score}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-mute">{label}</div>
        </div>
      </div>
    </div>
  );
}
