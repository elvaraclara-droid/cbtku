import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBT SMART EXAM | Smart Examination, Secure Assessment",
  description:
    "Platform ujian berbasis komputer untuk sekolah dengan sistem anti-cheating, pemantauan pengawas langsung, penyimpanan otomatis, dan keamanan berlapis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
