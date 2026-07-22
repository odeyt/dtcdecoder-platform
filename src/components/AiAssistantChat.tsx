"use client";

import { useState } from "react";
import Link from "next/link";

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

export function AiAssistantChat({ signedIn }: { signedIn: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function sendMessage(text: string) {
    if (!text.trim() || status === "loading") return;
    setErrorMessage(null);
    setStatus("loading");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
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
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: accumulated };
          return next;
        });
      }

      setStatus("idle");
    } catch {
      setErrorMessage("Something went wrong. Try again.");
      setStatus("error");
    }
  }

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md">
        <p className="text-white">Sign in to use the DTC AI Assistant.</p>
        <p className="mt-2 text-sm text-zinc-400">
          Free accounts get 5 AI questions a day — Pro and Workshop are unlimited.
        </p>
        <Link
          href="/account/login"
          className="mt-4 inline-block rounded-full bg-red-600 px-6 py-2 font-semibold text-white transition hover:bg-red-500"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => sendMessage(example)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-[200px] space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-md">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Describe a code, symptom, or vehicle issue and get a technician-style diagnosis.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <p
              className={`inline-block max-w-full rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-red-600 text-white"
                  : "bg-white/10 text-zinc-100"
              }`}
            >
              {m.content || "…"}
            </p>
          </div>
        ))}
        {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex gap-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your issue…"
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {status === "loading" ? "Thinking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
