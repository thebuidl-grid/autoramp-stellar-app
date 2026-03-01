import Link from "next/link";

function Footer() {
  return (
    <footer className="py-8 px-6 border-t border-white/10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center text-white/40 text-sm gap-3">
          <Link href="/api-docs" target="_blank">
            API Documentation
          </Link>
          <Link href="/terms-of-service" target="_blank">
            Terms of Service
          </Link>
          <Link href="/privacy-policy" target="_blank">
            Privacy Policy
          </Link>
        </div>
        <p className="text-sm text-white/40">
          © 2025 AutoRamp. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
