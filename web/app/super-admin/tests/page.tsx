import type { Metadata } from "next";
import TestsClient from "./page-client";

export const metadata: Metadata = {
  title: "Test Results | iCARE++",
};

export default function TestsPage() {
  return <TestsClient />;
}
