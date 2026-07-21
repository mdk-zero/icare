import type { Metadata } from "next";
import { Suspense } from "react";
import ClientFacultyLayout from "./layout-client";

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
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ClientFacultyLayout>{children}</ClientFacultyLayout>
    </Suspense>
  );
}
