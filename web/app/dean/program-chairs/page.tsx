import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession } from "@/app/lib/auth/session";
import { readDeanSession } from "@/app/lib/auth/dean";
import { DEMO_COOKIE } from "@/app/lib/demo/session";
import ProgramChairsClient from "./page-client";

export const metadata: Metadata = {
  title: "Program Chairs | iCARE++",
};

// Who may open this depends on the live account; never prerender it.
export const dynamic = "force-dynamic";

/** A Dean's page only. A Program Chair, who shares the rest of the portal, is sent to the Overview. */
export default async function ProgramChairsPage() {
  const session = await readSession();
  if (!session) {
    // A demo has no session, and its title lives in the visitor's browser, so
    // the layout turns a demo Program Chair away.
    if ((await cookies()).get(DEMO_COOKIE)?.value === "admin") return <ProgramChairsClient />;
    redirect("/login");
  }
  if (!(await readDeanSession())) redirect("/dean");

  return <ProgramChairsClient />;
}
