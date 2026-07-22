import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AiAssistantChat } from "@/components/AiAssistantChat";

export const metadata: Metadata = {
  title: "DTC AI Assistant",
  description:
    "Describe a fault code, symptom, or vehicle issue and get a professional master-technician diagnosis.",
};

export default async function AiAssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">DTC AI Assistant</h1>
      <p className="mt-2 text-zinc-400">
        Instantly decode fault codes, understand symptoms, find common causes, and
        follow professional diagnostic steps before replacing parts.
      </p>
      <div className="mt-8">
        <AiAssistantChat signedIn={Boolean(user)} />
      </div>
    </div>
  );
}
