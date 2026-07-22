import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dtc", label: "DTC Lookup" },
  { href: "/ai-assistant", label: "AI Assistant" },
  { href: "/repair-pdfs", label: "Repair PDFs" },
  { href: "/videos", label: "Videos" },
  { href: "/blog", label: "Blog" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-1 font-bold text-white">
          <span className="text-red-500">DTC</span>
          <span>Decoder</span>
        </Link>
        <nav className="hidden gap-6 text-sm font-medium text-zinc-300 md:flex">
          {NAV_LINKS.slice(1).map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/account/login"
          className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-white transition hover:bg-white/10"
        >
          Sign In
        </Link>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t border-white/5 px-6 py-2 text-xs text-zinc-400 md:hidden">
        {NAV_LINKS.slice(1).map((link) => (
          <Link key={link.href} href={link.href} className="whitespace-nowrap">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
