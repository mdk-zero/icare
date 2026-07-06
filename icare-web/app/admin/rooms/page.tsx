import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rooms | iCARE++",
};

import RoomsClient from "./page-client";

export default function RoomsPage() {
  return <RoomsClient />;
}