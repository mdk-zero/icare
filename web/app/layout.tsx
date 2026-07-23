import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "./lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Sans-serif display face for page and section titles. Replaces Fraunces (a
 * serif), so titles no longer fall back to Georgia.
 */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700"],
});

/** Editorial display face used by the analytics broadsheet (see .font-brico). */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Login | iCARE++",
  description: "Welcome back!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${bricolage.variable} h-full antialiased`}
    >
      <head>
        {/* Must run before first paint, or the page flashes light then snaps to dark. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
