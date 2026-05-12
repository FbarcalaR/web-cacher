import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Cacher",
  description: "Snapshot and search web pages that disappear.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/" className="brand">Web Cacher</a>
          <nav>
            <a href="/">Capture</a>
            <a href="/library">Library</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
