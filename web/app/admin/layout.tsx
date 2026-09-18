import type { Metadata } from "next";
import { Suspense } from "react";
import ClientAdminLayout from "./layout-client";
import { EcgLoader } from "../components/EcgLoader";

export const metadata: Metadata = {
  title: "Admin | iCARE++",
};

export default function AdminLayout({
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
      <ClientAdminLayout>{children}</ClientAdminLayout>
    </Suspense>
  );
}
