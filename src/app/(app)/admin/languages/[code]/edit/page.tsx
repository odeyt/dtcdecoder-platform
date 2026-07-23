import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getLanguageForAdmin } from "@/lib/admin-languages";
import { updateLanguageAction } from "@/app/(app)/admin/actions/languages";
import { AdminLanguageForm } from "@/components/AdminLanguageForm";

type Props = {
  params: Promise<{ code: string }>;
};

export default async function EditLanguagePage({ params }: Props) {
  await requireAdmin();
  const { code } = await params;
  const language = await getLanguageForAdmin(code);
  if (!language) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">
        Edit language: {language.english_name} ({language.locale_code})
      </h1>
      <div className="mt-6">
        <AdminLanguageForm language={language} action={updateLanguageAction.bind(null, code)} />
      </div>
    </div>
  );
}
