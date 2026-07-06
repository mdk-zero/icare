import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users | iCARE++",
};

import UsersClient from "./page-client";

export default function UsersPage() {
  return <UsersClient />;
}