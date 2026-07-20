import Link from "next/link";

const links = [
  { href: "/catalog", label: "All Products" },
  { href: "/wiring-diagrams", label: "Wiring Diagrams" },
  { href: "/software-tools", label: "Software & Tools" },
];

export function CategoryNav() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-bold">
          DTCDecoder
        </Link>
        <nav className="flex gap-6 text-sm font-medium">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
          <Link href="/account" className="hover:underline">
            My Account
          </Link>
        </nav>
      </div>
    </header>
  );
}
