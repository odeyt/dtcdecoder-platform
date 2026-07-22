"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLES = [
  "What causes P0420?",
  "My BMW has rough idle and P0171",
  "Range Rover has P2263 and limp mode",
  "Toyota has P0300 misfire",
  "Car has no crank and U0101",
];

const BASE_AI_STAGES = [
  "Validating request",
  "Searching diagnostic database for grounding data",
  "Consulting the AI diagnostic model",
];

interface OutputLocaleOption {
  code: string;
  name: string;
}

export function AiAssistantChat({
  signedIn,
  outputLocaleOptions = [],
}: {
  signedIn: boolean;
  outputLocaleOptions?: OutputLocaleOption[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "waiting" | "streaming" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outputLocale, setOutputLocale] = useState("en");
  const abortRef = useRef<AbortController | null>(null);

  const selectedLocaleName = outputLocaleOptions.find((o) => o.code === outputLocale)?.name;
  // A non-English request skips streaming the English answer entirely (see
  // the API route) — the whole English generation, then the translation,
  // happen before the client sees a single byte. Naming that wait honestly
  // rather than reusing the English-only stage list.
  const aiStages =
    outputLocale !== "en" && selectedLocaleName
      ? [...BASE_AI_STAGES, `Translating the diagnosis into ${selectedLocaleName}`]
      : BASE_AI_STAGES;

  async function sendMessage(text: string) {
    if (!text.trim() || status === "waiting" || status === "streaming") return;
    setErrorMessage(null);
    setStatus("waiting");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, outputLocale }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? "Something went wrong. Try again.");
        setStatus("error");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
        const accumulated = chunks.join("");
        setStatus("streaming");
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: accumulated };
          return next;
        });
      }

      setStatus("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => prev.slice(0, -2));
        setStatus("idle");
        return;
      }
      setErrorMessage("Something went wrong. Try again.");
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  if (!signedIn) {
    return (
      <div className="glass-panel rounded-[var(--radius-xl)] p-10 text-center">
        <p className="text-[var(--text-primary)]">Sign in to use the DTC AI Assistant.</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Free accounts get 5 AI questions a day — Pro and Workshop get a much larger monthly allowance.
        </p>
        <Link
          href="/account/login"
          className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const isPendingFirstToken =
    status === "waiting" && messages[messages.length - 1]?.content === "";

  return (
    <div className="flex flex-col gap-4">
      {outputLocaleOptions.length > 0 && (
        <div className="flex items-center justify-end gap-2 text-sm text-[var(--text-secondary)]">
          <label htmlFor="ai-output-locale">Answer in:</label>
          <select
            id="ai-output-locale"
            value={outputLocale}
            onChange={(e) => setOutputLocale(e.target.value)}
            disabled={status === "waiting" || status === "streaming"}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
          >
            <option value="en">English</option>
            {outputLocaleOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => sendMessage(example)}
              className="min-h-11 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="glass-panel min-h-[200px] space-y-4 rounded-[var(--radius-xl)] p-6">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">
            Describe a code, symptom, or vehicle issue and get a technician-style diagnosis.
          </p>
        )}
        {messages.map((m, i) => {
          const isPendingAssistantBubble =
            m.role === "assistant" && i === messages.length - 1 && isPendingFirstToken;
          if (isPendingAssistantBubble) {
            return <DiagnosticProgress key={i} stages={aiStages} onCancel={cancel} />;
          }
          return (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <p
                className={`inline-block max-w-full rounded-[var(--radius-lg)] px-4 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[var(--accent-red)] text-white"
                    : "bg-white/[0.06] text-[var(--text-primary)]"
                }`}
              >
                {m.content}
              </p>
            </div>
          );
        })}
        {errorMessage && <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex gap-3"
      >
        <label htmlFor="ai-assistant-input" className="sr-only">
          Describe your vehicle issue
        </label>
        <input
          id="ai-assistant-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your issue…"
          className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          disabled={status === "waiting" || status === "streaming"}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "waiting" || status === "streaming" ? "Thinking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
