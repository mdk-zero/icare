import type { Metadata } from "next";
import LibraryClient from "./page-client";

export const metadata: Metadata = {
  title: "Library | iCARE++ Instructor",
};

export default function FacultyLibraryPage() {
  return <LibraryClient />;
}
