"use client";

import { useEffect, useRef, useState } from "react";

const SYSTEMS = ["Engine", "Fuel", "Ignition", "Emissions", "Network", "Safety"];

export interface DiagnosticProgressProps {
  /** Real, honest stage labels — must correspond to actual steps this
   * request performs. Never invent stages that imply capabilities (a second
   * AI system, a live vehicle connection, a manufacturer database) that
   * don't exist. */
  stages: string[];
  query?: string;
  onCancel?: () => void;
}

// Advances through the given (real) stages on a fixed cadence and holds on
// the last one — it does not loop back to stage 1, since "we're still
// waiting" is honest while re-announcing "validating request" after a long
// wait would not be. This is ambient motion only: it never blocks or delays
// the actual request, and unmounts as soon as the real response arrives.
export function DiagnosticProgress({ stages, query, onCancel }: DiagnosticProgressProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const activeSystem = useRef(0);
  const [systemIndex, setSystemIndex] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, stages.length - 1));
    }, 1100);
    return () => clearInterval(interval);
  }, [stages.length]);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => {
      activeSystem.current = (activeSystem.current + 1) % SYSTEMS.length;
      setSystemIndex(activeSystem.current);
    }, 650);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-panel relative overflow-hidden rounded-[var(--radius-xl)] p-8 sm:p-10"
    >
      {/* Faint perspective grid — decorative only, aria-hidden */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />

      {!reducedMotion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--accent-red), transparent)",
            animation: "scan-line 2.4s ease-in-out infinite",
          }}
        />
      )}

      <div className="relative">
        {query && (
          <p className="font-mono text-xs text-[var(--text-muted)]">
            Query: <span className="text-[var(--text-secondary)]">{query}</span>
          </p>
        )}

        <p className="mt-4 font-mono text-sm text-[var(--accent-red)]">
          {stages[stageIndex]}
          <span aria-hidden="true" className="ml-1 inline-block animate-pulse">
            …
          </span>
        </p>

        {/* Real progress indicator — width reflects stage index, not a
            fabricated percentage of unknown total work. */}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-[var(--accent-red)] transition-[width] duration-500 ease-out"
            style={{ width: `${((stageIndex + 1) / stages.length) * 100}%` }}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {SYSTEMS.map((system, i) => (
            <span
              key={system}
              className="rounded-full border px-3 py-1 font-mono text-xs transition-colors duration-500"
              style={{
                borderColor:
                  !reducedMotion && i === systemIndex
                    ? "var(--border-red)"
                    : "var(--border-subtle)",
                color:
                  !reducedMotion && i === systemIndex
                    ? "var(--accent-red)"
                    : "var(--text-muted)",
              }}
            >
              {system}
            </span>
          ))}
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-8 min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
        )}

        <span className="sr-only">
          Diagnostic in progress: {stages[stageIndex]}
        </span>
      </div>

      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(160px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
