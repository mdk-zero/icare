import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | iCARE++",
  description: "Request account activation for iCARE++",
};

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
