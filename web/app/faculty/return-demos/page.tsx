import type { Metadata } from "next";
import ReturnDemosClient from "./page-client";

export const metadata: Metadata = {
  title: "Return Demonstrations | iCARE++ Instructor",
};

export default function ReturnDemosPage() {
  return <ReturnDemosClient />;
}
