import type { Metadata } from "next";
import { Suspense } from "react";
import ClientSuperAdminLayout from "./layout-client";
import { EcgLoader } from "../components/EcgLoader";

export const metadata: Metadata = {
  title: "System Administration | iCARE++",
};

export default function SuperAdminLayout({
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
      <ClientSuperAdminLayout>{children}</ClientSuperAdminLayout>
    </Suspense>
  );
}
