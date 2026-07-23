"use client";

import { useActionState } from "react";
import type { Language } from "@/lib/types";

interface Props {
  language: Language;
  action: (formData: FormData) => Promise<{ error?: string }>;
}

export function AdminLanguageForm({ language, action }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => action(formData),
    {},
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Checkbox name="enabled" label="Enabled" defaultChecked={language.enabled} />
        <Checkbox name="publicAvailable" label="Public available" defaultChecked={language.public_available} />
        <Checkbox name="paidOnly" label="Paid only" defaultChecked={language.paid_only} />
        <Checkbox name="aiInputEnabled" label="AI input enabled" defaultChecked={language.ai_input_enabled} />
        <Checkbox name="aiOutputEnabled" label="AI output enabled" defaultChecked={language.ai_output_enabled} />
        <Checkbox name="bilingualEnabled" label="Bilingual enabled" defaultChecked={language.bilingual_enabled} />
        <Checkbox
          name="multilingualEnabled"
          label="Multilingual enabled"
          defaultChecked={language.multilingual_enabled}
        />
        <Checkbox name="seoEnabled" label="SEO indexing" defaultChecked={language.seo_enabled} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-zinc-300">
          Support tier
          <select
            name="supportTier"
            defaultValue={language.support_tier}
            className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
          >
            <option value={1}>Tier 1 — Fully verified</option>
            <option value={2}>Tier 2 — AI-supported</option>
            <option value={3}>Tier 3 — Experimental</option>
            <option value={4}>Tier 4 — Disabled</option>
          </select>
        </label>

        <label className="block text-sm text-zinc-300">
          Safety review status
          <select
            name="safetyReviewStatus"
            defaultValue={language.safety_review_status}
            className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
          >
            <option value="not_reviewed">Not reviewed</option>
            <option value="in_review">In review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label className="block text-sm text-zinc-300">
          UI translation completion (%)
          <input
            type="number"
            name="uiTranslationCompletionPercent"
            min={0}
            max={100}
            defaultValue={language.ui_translation_completion_percent}
            className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Glossary completion (%)
          <input
            type="number"
            name="glossaryCompletionPercent"
            min={0}
            max={100}
            defaultValue={language.glossary_completion_percent}
            className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
          />
        </label>

        <label className="block text-sm text-zinc-300">
          Display order
          <input
            type="number"
            name="displayOrder"
            defaultValue={language.display_order}
            className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
          />
        </label>
      </div>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}
