import { MagicLinkForm } from "@/components/MagicLinkForm";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">Sign in to your account</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        No password needed — we&apos;ll email you a login link.
      </p>
      <div className="mt-6">
        <MagicLinkForm next={next} />
      </div>
    </div>
  );
}
