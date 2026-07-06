import type { Metadata } from "next";
import FacultyScenariosClient from "./page-client";

export const metadata: Metadata = {
  title: "Simulation Scenarios | iCARE++ Faculty",
};

export default function FacultyScenariosPage() {
  return <FacultyScenariosClient />;
}