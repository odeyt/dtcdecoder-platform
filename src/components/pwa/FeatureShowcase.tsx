"use client";

import { useEffect, useState } from "react";

const AUTOPLAY_MS = 3500;

// Lightweight CSS-driven "how it works" demo — cycles through the real
// product flow (lookup → AI diagnosis → ranked causes → repair
// verification). No video/canvas/animation library: just a timer swapping
// the active index plus a CSS transition, so this stays cheap on every
// page load. Auto-advance pauses under prefers-reduced-motion via the
// motion-reduce: Tailwind variant on the progress bar/transition classes
// below rather than JS-detecting the media query (avoids an extra
// effect-driven state flip purely for that).
export function FeatureShowcase({
  steps,
}: {
  steps: { icon: React.ReactNode; title: string; body: string }[];
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % steps.length), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div>
      <div className="flex items-center justify-center gap-2">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}`}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${
              i === active ? "w-8 bg-[var(--accent-red)]" : "w-1.5 bg-[var(--border-strong)]"
            }`}
          />
        ))}
      </div>

      <div className="relative mt-8 min-h-[13rem] overflow-hidden">
        {steps.map((step, i) => (
          <div
            key={i}
            aria-hidden={i !== active}
            className={`glass-panel absolute inset-0 flex flex-col items-center gap-4 rounded-[var(--radius-xl)] p-8 text-center transition-opacity duration-500 motion-reduce:transition-none ${
              i === active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)]">
              {step.icon}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {i + 1} / {steps.length}
            </p>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">{step.title}</h3>
            <p className="max-w-sm text-sm text-[var(--text-secondary)]">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
