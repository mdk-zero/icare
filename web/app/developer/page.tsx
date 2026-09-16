import { notFound } from "next/navigation";
import { readDeveloperSession } from "@/app/lib/auth/developer";
import ConsoleClient from "./console-client";

export default async function DeveloperPage() {
  const session = await readDeveloperSession();
  if (!session) notFound();
  return <ConsoleClient email={session.email} role={session.role} />;
}
