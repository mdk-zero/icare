import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";
import { PRIVACY } from "../lib/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy · iCARE++",
  description:
    "What personal data iCARE++ collects in the BSN program of the College of Health Sciences, BatStateU ARASOF Nasugbu, and your rights under the Data Privacy Act of 2012.",
};

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} other={{ href: "/terms", label: "Terms of Use" }} />;
}
