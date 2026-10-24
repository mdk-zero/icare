import type { Metadata } from "next";
import HelpCenter from "../../components/HelpCenter";
import { CONTACT_EMAIL } from "../../lib/dev-team";

export const metadata: Metadata = {
  title: "Help & Support | iCARE++",
};

export default function AdminHelpPage() {
  return <HelpCenter contactEmail={CONTACT_EMAIL} />;
}
