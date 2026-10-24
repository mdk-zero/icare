import type { Metadata } from "next";
import LibraryClient from "../../instructor/library/page-client";

export const metadata: Metadata = {
  title: "Library | iCARE++",
};

/** The same Library, over the dean's own materials and their instructors'. */
export default function AdminLibraryPage() {
  return <LibraryClient />;
}
