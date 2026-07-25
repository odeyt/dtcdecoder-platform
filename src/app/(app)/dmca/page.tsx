import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMCA / Copyright Policy",
};

export default function DmcaPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white">DMCA / Copyright Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective Date: July 25, 2026</p>

      <p className="mt-6">
        DTCDecoder respects the intellectual property rights of others and expects users to do the
        same. We respond to valid notices of alleged copyright infringement under the Digital
        Millennium Copyright Act (DMCA) and comparable laws.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Reporting Infringement</h2>
      <p className="mt-4">
        If you believe content on our platform infringes your copyright, send a written notice to
        our designated contact including:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Your physical or electronic signature</li>
        <li>Identification of the copyrighted work claimed to be infringed</li>
        <li>Identification of the material claimed to be infringing, with enough detail to locate it</li>
        <li>Your contact information (name, address, email, phone)</li>
        <li>
          A statement that you have a good-faith belief the use is not authorized by the copyright
          owner, its agent, or the law
        </li>
        <li>
          A statement, under penalty of perjury, that the information is accurate and you are
          authorized to act on the copyright owner&apos;s behalf
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-white">Designated Contact</h2>
      <p className="mt-4">
        Send DMCA notices to{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>{" "}
        with the subject line &quot;DMCA Notice.&quot;
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Counter-Notification</h2>
      <p className="mt-4">
        If you believe material you posted was removed in error, you may submit a counter-notice
        containing your signature, identification of the removed material and its former location, a
        statement under penalty of perjury that the removal was a mistake, and your consent to
        applicable jurisdiction.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Repeat Infringers</h2>
      <p className="mt-4">
        We may suspend or terminate accounts of users who are found to be repeat infringers.
      </p>

      <h2 className="mt-10 text-xl font-bold text-white">Contact</h2>
      <p className="mt-4">
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
