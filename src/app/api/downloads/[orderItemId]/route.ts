import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyPurchaseAndGetFile } from "@/lib/orders";
import { createSignedDownloadUrl } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderItemId: string }> },
) {
  const { orderItemId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const verification = await verifyPurchaseAndGetFile(user.id, orderItemId);
  if (!verification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signedUrl = await createSignedDownloadUrl(
    verification.productFile.storage_path,
  );

  return NextResponse.redirect(signedUrl);
}
