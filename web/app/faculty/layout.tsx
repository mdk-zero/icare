import type { Metadata } from "next";
import { Suspense } from "react";
import ClientFacultyLayout from "./layout-client";
import { EcgLoader } from "../components/EcgLoader";

export const metadata: Metadata = {
  title: "Faculty | iCARE++",
};

export default function FacultyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <EcgLoader size="lg" className="text-brand-600" />
        </div>
      }
    >
      <ClientFacultyLayout>{children}</ClientFacultyLayout>
    </Suspense>
  );
}
