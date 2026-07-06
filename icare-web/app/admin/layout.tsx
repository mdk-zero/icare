import type { Metadata } from "next";
import { Suspense } from "react";
import ClientAdminLayout from "./layout-client";

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
          <div className="w-8 h-8 border-4 border-[#1B6B7B] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ClientAdminLayout>{children}</ClientAdminLayout>
    </Suspense>
  );
}
