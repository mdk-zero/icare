import type { Metadata } from "next";
import CaseNewClient from "./page-client";

export const metadata: Metadata = {
  title: "New Case Presentation | iCARE++ Instructor",
};

export default function Page() {
  return <CaseNewClient />;
}
