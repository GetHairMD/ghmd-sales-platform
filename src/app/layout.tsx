import type { Metadata } from "next";
import { DM_Sans, Poppins, Cardo, Source_Code_Pro } from "next/font/google";
import "./globals.css";

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

// True root layout — html/body/fonts/metadata ONLY. Deliberately minimal and
// auth-free: it wraps every route, incl. public prospect-facing pages (/p/[slug],
// /login), so it must never touch getViewerDesignation or
// the shell. The authenticated shell + role gate live in the (app) route group's
// layout, which wraps internal pages only.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = `${dmSans.variable} ${poppins.variable} ${cardo.variable} ${sourceCodePro.variable}`;
  return (
    <html lang="en">
      <body className={`${fontVars} font-body antialiased bg-bg text-text`}>
        {children}
      </body>
    </html>
  );
}
