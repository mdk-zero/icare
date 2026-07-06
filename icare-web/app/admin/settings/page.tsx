import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | iCARE++",
};

import SettingsClient from "./page-client";

export default function SettingsPage() {
  return <SettingsClient />;
}