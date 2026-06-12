"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

// ─── Constellation data ───────────────────────────────────────────────────────
// Ursa Minor (the Little Dipper) terminating at Polaris — the brand's namesake.
// Coordinates are in a 0–100 × 0–60 viewBox biased to the upper-right of the hero.

type Star = { x: number; y: number; r: number; o: number; twinkle?: boolean };

const POLARIS: Star = { x: 84, y: 14, r: 1.9, o: 1, twinkle: true };

const DIPPER: Star[] = [
  POLARIS,
  { x: 73, y: 20, r: 1.0, o: 0.85, twinkle: true },
  { x: 64, y: 27, r: 1.1, o: 0.8 },
  { x: 56, y: 23, r: 1.3, o: 0.9, twinkle: true },
  { x: 49, y: 31, r: 1.1, o: 0.8 },
  { x: 55, y: 37, r: 1.0, o: 0.75 },
  { x: 62, y: 34, r: 1.2, o: 0.85, twinkle: true },
];
const DIPPER_LINES = [...DIPPER.map((s) => `${s.x},${s.y}`), `${DIPPER[2].x},${DIPPER[2].y}`].join(" ");

const FIELD: Star[] = [
  { x: 12, y: 18, r: 0.7, o: 0.5 },
  { x: 22, y: 38, r: 0.5, o: 0.4, twinkle: true },
  { x: 34, y: 12, r: 0.6, o: 0.5 },
  { x: 41, y: 44, r: 0.5, o: 0.35 },
  { x: 18, y: 52, r: 0.6, o: 0.4, twinkle: true },
  { x: 78, y: 40, r: 0.6, o: 0.45 },
  { x: 90, y: 30, r: 0.5, o: 0.4 },
  { x: 8, y: 33, r: 0.5, o: 0.35, twinkle: true },
  { x: 47, y: 9, r: 0.5, o: 0.4 },
  { x: 70, y: 9, r: 0.6, o: 0.45 },
  { x: 29, y: 26, r: 0.45, o: 0.3 },
  { x: 95, y: 48, r: 0.5, o: 0.35, twinkle: true },
];

// Reuse the sine/cos noise idea from MiniProbabilityChart for drifting sparklines.
function sparkPoints(seed: number, base: number) {
  return Array.from({ length: 20 }, (_, i) => {
    const noise = Math.sin(i * 0.9 + seed) * 7 + Math.cos(i * 0.5 + seed) * 5;
    const y = Math.max(8, Math.min(92, base + noise));
    return `${(i / 19) * 100},${y}`;
  }).join(" ");
}

// Tiny tileable film-grain texture (kills gradient banding — a real production trick).
const GRAIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>`,
  );

export function HeroBackground() {
  const reduce = useReducedMotion();
  const yesSpark = useMemo(() => sparkPoints(1.2, 40), []);
  const noSpark = useMemo(() => sparkPoints(3.7, 62), []);

  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* 1 — Deep-space gradient base (violet → page bg; blends into the stats band) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, hsl(258 62% 9%) 0%, hsl(247 55% 7%) 30%, hsl(230 60% 5%) 58%, hsl(222 84% 3%) 82%)",
        }}
      />

      {/* 2 — Breathing aurora glows (soft, blurred, slow — depth without noise) */}
      <motion.div
        className="absolute -top-1/4 right-[8%] h-[60vh] w-[60vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(263 75% 60% / 0.30) 0%, transparent 65%)" }}
        animate={reduce ? undefined : { opacity: [0.55, 0.9, 0.55], scale: [1, 1.08, 1] }}
        transition={reduce ? undefined : { duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[20%] left-[-6%] h-[46vh] w-[46vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(215 80% 55% / 0.18) 0%, transparent 65%)" }}
        animate={reduce ? undefined : { opacity: [0.4, 0.7, 0.4], scale: [1.05, 1, 1.05] }}
        transition={reduce ? undefined : { duration: 14, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />
      <motion.div
        className="absolute bottom-[2%] left-[28%] h-[34vh] w-[40vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(142 71% 45% / 0.10) 0%, transparent 65%)" }}
        animate={reduce ? undefined : { opacity: [0.5, 0.8, 0.5] }}
        transition={reduce ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      />

      {/* 3 — Perspective grid floor (trading-terminal horizon) */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] [perspective:480px] overflow-hidden">
        <motion.div
          className="absolute inset-x-[-50%] bottom-0 h-[200%] origin-bottom [transform:rotateX(74deg)]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(263 70% 63% / 0.22) 1px, transparent 1px), linear-gradient(90deg, hsl(263 70% 63% / 0.18) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 62%)",
            maskImage: "linear-gradient(to top, black 0%, transparent 62%)",
          }}
          animate={reduce ? undefined : { backgroundPositionY: ["0px", "56px"] }}
          transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Horizon glow line where the grid meets the sky */}
      <div
        className="absolute inset-x-0 top-[45%] h-px"
        style={{ background: "linear-gradient(to right, transparent, hsl(263 80% 68% / 0.45), transparent)" }}
      />

      {/* 4 — Drifting probability sparklines just above the horizon */}
      <div className="absolute inset-x-0 top-[34%] h-[16%] opacity-[0.16]">
        <motion.svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-[200%]"
          animate={reduce ? undefined : { x: ["0%", "-50%"] }}
          transition={reduce ? undefined : { duration: 34, repeat: Infinity, ease: "linear" }}
        >
          <polyline points={yesSpark} fill="none" stroke="#22c55e" strokeWidth="0.7" strokeLinecap="round" />
          <polyline
            points={yesSpark.replace(/([\d.]+),/g, (_, x) => `${parseFloat(x) + 100},`)}
            fill="none"
            stroke="#22c55e"
            strokeWidth="0.7"
            strokeLinecap="round"
          />
        </motion.svg>
        <motion.svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-[200%]"
          animate={reduce ? undefined : { x: ["-50%", "0%"] }}
          transition={reduce ? undefined : { duration: 46, repeat: Infinity, ease: "linear" }}
        >
          <polyline points={noSpark} fill="none" stroke="#ef4444" strokeWidth="0.7" strokeLinecap="round" />
          <polyline
            points={noSpark.replace(/([\d.]+),/g, (_, x) => `${parseFloat(x) + 100},`)}
            fill="none"
            stroke="#ef4444"
            strokeWidth="0.7"
            strokeLinecap="round"
          />
        </motion.svg>
      </div>

      {/* 5 — Constellation (upper layer) with slow parallax drift */}
      <motion.svg
        viewBox="0 0 100 60"
        preserveAspectRatio="xMidYMin slice"
        className="absolute inset-x-0 top-0 h-[62%] w-full"
        animate={reduce ? undefined : { x: [0, -1.2, 0], y: [0, 0.8, 0] }}
        transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: "easeInOut" }}
      >
        <polyline
          points={DIPPER_LINES}
          fill="none"
          stroke="hsl(263 70% 72% / 0.35)"
          strokeWidth="0.18"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="120"
          strokeDashoffset={reduce ? 0 : 120}
        >
          {!reduce && (
            <animate attributeName="stroke-dashoffset" from="120" to="0" dur="1.8s" fill="freeze" begin="0.4s" />
          )}
        </polyline>

        {/* Polaris glow halo + pulse */}
        <circle cx={POLARIS.x} cy={POLARIS.y} r="5" fill="hsl(263 70% 63% / 0.10)" />
        <motion.circle
          cx={POLARIS.x}
          cy={POLARIS.y}
          r="2.8"
          fill="hsl(263 75% 72% / 0.22)"
          animate={reduce ? undefined : { r: [2.8, 3.6, 2.8], opacity: [0.22, 0.4, 0.22] }}
          transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {[...DIPPER, ...FIELD].map((s, i) => (
          <motion.circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s === POLARIS ? "#ddd6fe" : "#eceaff"}
            initial={false}
            animate={reduce || !s.twinkle ? { opacity: s.o } : { opacity: [s.o, s.o * 0.35, s.o] }}
            transition={
              reduce || !s.twinkle
                ? undefined
                : { duration: 2.6 + (i % 4) * 0.7, repeat: Infinity, ease: "easeInOut", delay: (i % 5) * 0.5 }
            }
          />
        ))}
      </motion.svg>

      {/* 6 — Film grain (mix-blend to kill banding, adds tactile texture) */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-soft-light"
        style={{ backgroundImage: `url("${GRAIN}")`, backgroundSize: "180px 180px" }}
      />

      {/* 7 — Edge vignette + bottom fade for a clean seam into the next section */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 120% 80% at 50% 30%, transparent 55%, hsl(222 84% 3% / 0.7) 100%)" }}
      />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
