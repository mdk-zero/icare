import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";
import { TERMS } from "../lib/legal-content";

export const metadata: Metadata = {
  title: "Terms of Use · iCARE++",
  description: "The rules for using iCARE++ in the BSN program of the College of Health Sciences, BatStateU ARASOF Nasugbu.",
};

export default function TermsPage() {
  return <LegalPage doc={TERMS} other={{ href: "/privacy", label: "Privacy Policy" }} />;
}
