import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-black/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div>
            <p className="font-bold text-white">
              <span className="text-red-500">DTC</span> Decoder
            </p>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
              AI-powered automotive diagnostic intelligence.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-zinc-400 sm:flex sm:flex-col">
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="hover:text-white">
              YouTube
            </a>
            <a href="https://gumroad.com" target="_blank" rel="noopener noreferrer" className="hover:text-white">
              Gumroad
            </a>
            <Link href="/contact" className="hover:text-white">
              Contact
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/affiliate-disclosure" className="hover:text-white">
              Affiliate Disclosure
            </Link>
          </nav>
        </div>
        <p className="mt-10 text-xs text-zinc-600">
          © {new Date().getFullYear()} DTC Decoder. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
