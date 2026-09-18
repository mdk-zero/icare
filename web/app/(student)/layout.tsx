import { Suspense } from "react";
import StudentLayoutClient from "./layout-client";
import { EcgLoader } from "../components/EcgLoader";

export default function StudentLayout({
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
      <StudentLayoutClient>{children}</StudentLayoutClient>
    </Suspense>
  );
}
