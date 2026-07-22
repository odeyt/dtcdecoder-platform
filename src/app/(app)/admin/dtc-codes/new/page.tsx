import { AdminDtcForm } from "@/components/AdminDtcForm";
import { createDtcCodeAction } from "@/app/(app)/admin/actions";

export default function NewDtcCodePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">New DTC Code</h1>
      <div className="mt-6">
        <AdminDtcForm action={createDtcCodeAction} />
      </div>
    </div>
  );
}
