import type { Metadata } from "next";
import { Geist, Geist_Mono, Rubik_Mono_One } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rubikMonoOne = Rubik_Mono_One({
  variable: "--font-rubik",
  weight: "400",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${rubikMonoOne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
