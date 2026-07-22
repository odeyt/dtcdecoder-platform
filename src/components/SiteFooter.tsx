import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <div className="container-app px-6 py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div>
            <p className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
              <span className="text-[var(--accent-red)]">DTC</span> Decoder
            </p>
            <p className="mt-2 max-w-xs text-sm text-[var(--text-muted)]">
              AI-assisted automotive diagnostic intelligence — not a substitute
              for a qualified technician&apos;s in-person diagnosis.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:flex">
            <nav className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Product
              </span>
              <Link href="/blog" className="hover:text-[var(--text-primary)]">
                Blog
              </Link>
              <Link href="/videos" className="hover:text-[var(--text-primary)]">
                Videos
              </Link>
              <Link href="/history" className="hover:text-[var(--text-primary)]">
                History
              </Link>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-primary)]"
              >
                YouTube
              </a>
              <a
                href="https://gumroad.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-primary)]"
              >
                Gumroad
              </a>
            </nav>
            <nav className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Company
              </span>
              <Link href="/contact" className="hover:text-[var(--text-primary)]">
                Contact
              </Link>
              <Link href="/privacy" className="hover:text-[var(--text-primary)]">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-[var(--text-primary)]">
                Terms
              </Link>
              <Link href="/affiliate-disclosure" className="hover:text-[var(--text-primary)]">
                Affiliate Disclosure
              </Link>
            </nav>
          </div>
        </div>
        <p className="mt-12 text-xs text-[var(--text-muted)]">
          © {new Date().getFullYear()} DTC Decoder. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
