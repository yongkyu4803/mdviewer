import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mark_md — Modern Markdown Workspace",
  description: "A premium, high-performance, and beautifully designed Markdown viewer & editor workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
