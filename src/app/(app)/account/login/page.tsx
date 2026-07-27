import { LoginForms } from "@/components/LoginForms";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Sign in to your account</h1>
      <p className="mt-2 text-[var(--text-secondary)]">
        Use a magic link — no password needed — or sign in with a password if you&apos;ve set one.
      </p>
      <div className="mt-6 text-left">
        <LoginForms next={next} />
      </div>
    </div>
  );
}
