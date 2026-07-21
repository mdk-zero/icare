import { Suspense } from "react";
import StudentLayoutClient from "./layout-client";

export default function StudentLayout({
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
      <StudentLayoutClient>{children}</StudentLayoutClient>
    </Suspense>
  );
}
