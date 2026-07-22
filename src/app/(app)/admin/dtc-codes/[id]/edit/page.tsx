import { notFound } from "next/navigation";
import { getDtcCodeForAdmin } from "@/lib/admin-dtc";
import { AdminDtcForm } from "@/components/AdminDtcForm";
import { updateDtcCodeAction } from "@/app/(app)/admin/actions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditDtcCodePage({ params }: Props) {
  const { id } = await params;
  const dtc = await getDtcCodeForAdmin(id);
  if (!dtc) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Edit {dtc.code}</h1>
      <div className="mt-6">
        <AdminDtcForm dtc={dtc} action={updateDtcCodeAction.bind(null, id)} />
      </div>
    </div>
  );
}
