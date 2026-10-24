import type { Metadata } from "next";
import TestsClient from "./page-client";

export const metadata: Metadata = {
  title: "System Tests | iCARE++",
};

export default function TestsPage() {
  return <TestsClient />;
}
