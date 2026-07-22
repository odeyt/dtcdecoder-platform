import type { DtcCode } from "@/lib/types";

export function AdminDtcForm({
  dtc,
  action,
}: {
  dtc?: DtcCode;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code (e.g. P0420)" name="code" defaultValue={dtc?.code} required />
        <Field label="Slug (e.g. p0420 or n55-p0171)" name="slug" defaultValue={dtc?.slug} required />
        <Field
          label="Make (leave blank for generic — never blog/dtc/admin/account/api/pricing/contact/ai-assistant/videos/repair-pdfs/checkout)"
          name="make"
          defaultValue={dtc?.make ?? ""}
        />
        <Field label="Model" name="model" defaultValue={dtc?.model ?? ""} />
        <Field label="Engine code (e.g. n55)" name="engineCode" defaultValue={dtc?.engine_code ?? ""} />
        <div>
          <label className="block text-sm font-medium text-zinc-300">Difficulty</label>
          <select
            name="difficulty"
            defaultValue={dtc?.difficulty ?? "moderate"}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
          >
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="hard">Hard</option>
            <option value="professional">Professional</option>
          </select>
        </div>
      </div>

      <Field label="Title" name="title" defaultValue={dtc?.title} required />
      <Field label="Meta description" name="metaDescription" defaultValue={dtc?.meta_description ?? ""} />
      <TextArea label="Meaning" name="meaning" defaultValue={dtc?.meaning} required />
      <TextArea
        label="Symptoms (one per line)"
        name="symptoms"
        defaultValue={dtc?.symptoms.join("\n")}
      />
      <TextArea label="Causes (one per line)" name="causes" defaultValue={dtc?.causes.join("\n")} />
      <TextArea
        label="Diagnostic steps (one per line)"
        name="diagnosticSteps"
        defaultValue={dtc?.diagnostic_steps.join("\n")}
      />
      <TextArea label="Common mistakes" name="commonMistakes" defaultValue={dtc?.common_mistakes ?? ""} />
      <TextArea
        label="Related makes (one per line)"
        name="relatedMakes"
        defaultValue={dtc?.related_makes.join("\n")}
      />
      <TextArea
        label="FAQ (one per line: question :: answer)"
        name="faq"
        defaultValue={dtc?.faq.map((f) => `${f.q} :: ${f.a}`).join("\n")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="PDF (Gumroad) URL" name="pdfUrl" defaultValue={dtc?.pdf_url ?? ""} />
        <Field label="YouTube URL" name="youtubeUrl" defaultValue={dtc?.youtube_url ?? ""} />
      </div>

      <button
        type="submit"
        className="rounded-md bg-red-600 px-5 py-2 font-semibold text-white transition hover:bg-red-500"
      >
        Save
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
      />
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        rows={4}
        className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
      />
    </div>
  );
}
