"use client";

import { useState } from "react";
import { MagicLinkForm } from "@/components/MagicLinkForm";
import { PasswordLoginForm } from "@/components/PasswordLoginForm";

// Magic-link stays the default, primary experience (unchanged) — password
// sign-in is an opt-in alternative revealed via toggle, not a replacement.
export function LoginForms({ next }: { next?: string }) {
  const [mode, setMode] = useState<"magicLink" | "password">("magicLink");

  if (mode === "password") {
    return (
      <div className="flex flex-col gap-4">
        <PasswordLoginForm next={next} />
        <button
          type="button"
          onClick={() => setMode("magicLink")}
          className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Use a magic link instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MagicLinkForm next={next} />
      <button
        type="button"
        onClick={() => setMode("password")}
        className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Sign in with a password instead
      </button>
    </div>
  );
}
