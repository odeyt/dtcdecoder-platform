import { createAdminClient } from "@/lib/supabase/admin";
import { updateAiSystemPromptAction } from "@/app/admin/actions";

export default async function AdminSettingsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "ai_system_prompt")
    .maybeSingle();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">AI Prompt Settings</h1>
      <p className="mt-2 text-sm text-zinc-400">
        This is prepended before every AI assistant response. A safety
        instruction (never replace parts without testing) is always appended
        after this and cannot be removed here.
      </p>
      <form action={updateAiSystemPromptAction} className="mt-6 space-y-4">
        <textarea
          name="prompt"
          defaultValue={data?.value ?? ""}
          rows={12}
          placeholder="Leave blank to use the built-in default technician persona."
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          className="rounded-md bg-red-600 px-5 py-2 font-semibold text-white transition hover:bg-red-500"
        >
          Save
        </button>
      </form>
    </div>
  );
}
