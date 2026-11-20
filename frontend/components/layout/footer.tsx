import Link from "next/link";
import { CurrentYear } from "./current-year";

const links = [
  { label: "Guide", href: "/guide" },
  { label: "API Docs", href: "/docs" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];

function Footer() {
  return (
    <footer className="border-t border-white/5 px-3 py-6 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 text-sm text-white/40 sm:flex-row">
        <nav className="flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors duration-300 hover:text-secondary"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://t.me/+PJfVLZUFylFjZDhk"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-300 hover:text-secondary"
          >
            Telegram
          </a>
        </nav>
        <p>
          © <CurrentYear /> AutoRamp. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
