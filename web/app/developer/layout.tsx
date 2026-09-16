import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readDeveloperSession } from "@/app/lib/auth/developer";

export const metadata: Metadata = {
  title: "Developer | iCARE++",
  // Nothing here should ever appear in a search result or a link preview.
  robots: { index: false, follow: false },
};

/**
 * The gate.
 *
 * A caller who is not on the DEVELOPER_EMAILS allowlist gets the app's 404,
 * identical to a mistyped URL — including a signed-out one, which is why this
 * route is deliberately absent from proxy.ts's protected list. Being bounced
 * to /login would confirm that /developer is a real page worth returning to.
 */
export default async function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readDeveloperSession();
  if (!session) notFound();
  return children;
}
