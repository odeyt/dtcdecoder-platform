import { LOCALE_CODES } from "@/lib/i18n/locale-codes";
import type { TerminologyGlossaryEntry } from "@/lib/types";

interface Props {
  entry?: TerminologyGlossaryEntry;
  action: (formData: FormData) => void | Promise<void>;
}

// Plain server-rendered form (no client JS) matching the AdminDtcForm/
// blog-post admin form pattern — this screen doesn't need inline error
// display like the language/preferences forms do.
export function AdminGlossaryForm({ entry, action }: Props) {
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Field label="Canonical English term" htmlFor="termEn">
        <input
          id="termEn"
          name="termEn"
          type="text"
          defaultValue={entry?.term_en}
          required
          className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
        />
      </Field>

      <Field label="Locale" htmlFor="localeCode">
        <select
          id="localeCode"
          name="localeCode"
          defaultValue={entry?.locale_code ?? "es"}
          className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
        >
          {LOCALE_CODES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.englishName} ({l.code})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Approved translation" htmlFor="translatedTerm">
        <input
          id="translatedTerm"
          name="translatedTerm"
          type="text"
          defaultValue={entry?.translated_term}
          required
          className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white"
        />
      </Field>

      <Field label="Category (optional)" htmlFor="category">
        <input
          id="category"
          name="category"
          type="text"
          defaultValue={entry?.category ?? ""}
          placeholder="e.g. acronym, module_name, symptom, measurement"
          className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white placeholder:text-zinc-500"
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={entry?.notes ?? ""}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
        />
      </Field>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="doNotTranslate"
            defaultChecked={entry?.do_not_translate}
            className="h-4 w-4"
          />
          Do not translate (copy verbatim)
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="safetyCritical"
            defaultChecked={entry?.safety_critical}
            className="h-4 w-4"
          />
          Safety-critical term
        </label>
      </div>

      <Field label="Review status" htmlFor="reviewStatus">
        <select
          id="reviewStatus"
          name="reviewStatus"
          defaultValue={entry?.review_status ?? "draft"}
          className="min-h-11 w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 text-white"
        >
          <option value="draft">Draft</option>
          <option value="reviewed">Reviewed</option>
          <option value="approved">Approved</option>
        </select>
      </Field>

      <Field label="Reviewed by (optional)" htmlFor="reviewedBy">
        <input
          id="reviewedBy"
          name="reviewedBy"
          type="text"
          defaultValue={entry?.reviewed_by ?? ""}
          className="min-h-11 w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 text-white"
        />
      </Field>

      <button
        type="submit"
        className="min-h-11 rounded-lg bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
      >
        Save
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm">
      <span className="mb-1 block text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
