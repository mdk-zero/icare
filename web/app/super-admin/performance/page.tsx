import type { Metadata } from "next";
import PerformanceClient from "./page-client";

export const metadata: Metadata = {
  title: "Performance | iCARE++",
};

export default function PerformancePage() {
  return <PerformanceClient />;
}
