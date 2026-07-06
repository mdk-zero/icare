import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | iCARE++",
  description: "Create your iCARE++ account",
};

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
