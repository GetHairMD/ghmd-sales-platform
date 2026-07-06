import type { Metadata } from "next";
import { DM_Sans, Poppins, Cardo, Source_Code_Pro } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/shell/AppShell";

// GHMD brand typography (PRD §4.2) — served via next/font (Google Fonts, no files).
// DM Sans = headings + all-caps labels/buttons.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});
// Poppins = body / UI.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});
// Cardo = serif accent (subtitles, pull quotes, brand line).
const cardo = Cardo({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-cardo",
  display: "swap",
});
// Source Code Pro = mono.
const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-source-code-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GHMD Sales Platform",
  description: "GetHairMD territory sales operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = `${dmSans.variable} ${poppins.variable} ${cardo.variable} ${sourceCodePro.variable}`;
  return (
    <html lang="en">
      <body className={`${fontVars} font-body antialiased bg-bg text-text`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
