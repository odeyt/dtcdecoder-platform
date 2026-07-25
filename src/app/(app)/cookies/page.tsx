import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">DTCDecoder Cookie Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        This Cookie Policy explains how DTCDecoder uses cookies and similar technologies when you
        use our website and services.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">What Are Cookies</h2>
      <p className="mt-4">
        Cookies are small text files stored on your device that help websites function and remember
        information about your visit.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Types of Cookies We Use</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Essential</strong> — required for authentication, secure
          sign-in, and core site functionality. These cannot be disabled.
        </li>
        <li>
          <strong className="text-white">Preferences</strong> — remember choices such as language
          and display settings.
        </li>
        <li>
          <strong className="text-white">Analytics</strong> — help us understand how the platform is
          used so we can improve performance.
        </li>
        <li>
          <strong className="text-white">Security</strong> — help detect and prevent fraud and
          abuse.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Third-Party Cookies</h2>
      <p className="mt-4">
        Some cookies may be set by trusted third parties that support our Services, such as our
        payment processor Creem.io and infrastructure providers. These parties process data
        according to their own privacy policies.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Managing Cookies</h2>
      <p className="mt-4">
        You can control or delete cookies through your browser settings. Disabling essential cookies
        may prevent parts of the platform from working correctly, including sign-in.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Changes</h2>
      <p className="mt-4">
        We may update this Cookie Policy from time to time. Continued use of the Services
        constitutes acceptance of the revised policy.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Contact</h2>
      <p className="mt-4">
        Email:{" "}
        <a href="mailto:support@redlined1.com" className="text-[var(--accent-red)] underline">
          support@redlined1.com
        </a>
      </p>
    </div>
  );
}
