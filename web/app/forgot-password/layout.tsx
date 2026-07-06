import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | iCARE++",
  description: "Reset your iCARE++ password",
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
