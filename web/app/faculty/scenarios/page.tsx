import type { Metadata } from "next";
import FacultyScenariosClient from "./page-client";

export const metadata: Metadata = {
  title: "Simulation Scenarios | iCARE++ Instructor",
};

export default function FacultyScenariosPage() {
  return <FacultyScenariosClient />;
}