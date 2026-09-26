export function scoreColor(score: number) {
  return score >= 75 ? "var(--color-good)" : score >= 45 ? "var(--color-warn)" : "var(--color-bad)";
}

/** A 270° arc dial. Small dials put the label underneath so it never collides with the arc. */
export function ScoreDial({ score, size = 220, label = "Harmony" }: { score: number; size?: number; label?: string }) {
  const stroke = size < 150 ? 7 : 10;
  const r = size / 2 - stroke - 4;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const filled = arc * (score / 100);
  const color = scoreColor(score);
  const small = size < 150;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[135deg]">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${filled} ${c}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 ${small ? 5 : 10}px ${color})`, transition: "stroke-dasharray 600ms ease, stroke 600ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-display leading-none transition-colors duration-500" style={{ fontSize: size * 0.34, color }}>{score}</div>
            {!small && <div className="mt-1 text-xs uppercase tracking-[0.2em] text-mute">{label}</div>}
          </div>
        </div>
      </div>
      {small && <div className="-mt-3 text-[10px] uppercase tracking-[0.2em] text-mute">{label}</div>}
    </div>
  );
}
