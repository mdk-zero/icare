import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Select Role | iCARE++",
  description: "Choose your iCARE++ account type",
};

export default function SelectRoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
