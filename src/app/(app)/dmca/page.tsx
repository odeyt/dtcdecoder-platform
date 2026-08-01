import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMCA / Copyright Policy",
};

export default function DmcaPage() {
  return (
    <div className="prose-diagnostic mx-auto px-6 py-16">
      <h1>DMCA / Copyright Policy</h1>
      <p className="text-sm text-[var(--text-muted)]">Effective Date: July 25, 2026</p>

      <p>
        DTCDecoder respects the intellectual property rights of others and expects users to do the
        same. We respond to valid notices of alleged copyright infringement under the Digital
        Millennium Copyright Act (DMCA) and comparable laws.
      </p>

      <h2>Reporting Infringement</h2>
      <p>
        If you believe content on our platform infringes your copyright, send a written notice to
        our designated contact including:
      </p>
      <ul>
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

      <h2>Designated Contact</h2>
      <p>
        Send DMCA notices to{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>{" "}
        with the subject line &quot;DMCA Notice.&quot;
      </p>

      <h2>Counter-Notification</h2>
      <p>
        If you believe material you posted was removed in error, you may submit a counter-notice
        containing your signature, identification of the removed material and its former location, a
        statement under penalty of perjury that the removal was a mistake, and your consent to
        applicable jurisdiction.
      </p>

      <h2>Repeat Infringers</h2>
      <p>
        We may suspend or terminate accounts of users who are found to be repeat infringers.
      </p>

      <h2>Contact</h2>
      <p>
        Email:{" "}
        <a href="mailto:support@dtcdecoder.com" className="text-[var(--accent-red)] underline">
          support@dtcdecoder.com
        </a>
      </p>
    </div>
  );
}
