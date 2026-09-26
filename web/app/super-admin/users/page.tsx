import type { Metadata } from "next";
import SuperAdminUsersClient from "./page-client";

export const metadata: Metadata = {
  title: "Users | iCARE++",
};

export default function SuperAdminUsersPage() {
  return <SuperAdminUsersClient />;
}
