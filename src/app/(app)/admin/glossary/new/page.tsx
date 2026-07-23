import { requireAdmin } from "@/lib/admin-auth";
import { saveGlossaryEntryAction } from "@/app/(app)/admin/actions/glossary";
import { AdminGlossaryForm } from "@/components/AdminGlossaryForm";

export default async function NewGlossaryEntryPage() {
  await requireAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">New glossary term</h1>
      <div className="mt-6">
        <AdminGlossaryForm action={saveGlossaryEntryAction.bind(null, null)} />
      </div>
    </div>
  );
}
