"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { homeForRole } from "@/app/lib/dev/impersonation";
import { CONSOLE_STYLES } from "./styles";
import TablesPanel from "./TablesPanel";
import UsersPanel from "./UsersPanel";

type Tab = "tables" | "users";

export default function ConsoleClient({ email, role }: { email: string; role: string }) {
  const [tab, setTab] = useState<Tab>("tables");

  return (
    <div className="dc flex h-dvh flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: CONSOLE_STYLES }} />

      <header
        className="flex items-center gap-4 border-b px-4 py-2"
        style={{ borderColor: "var(--dc-line)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--dc-accent)", boxShadow: "0 0 8px var(--dc-accent)" }}
          />
          <span className="font-mono text-[12.5px] font-semibold tracking-tight">
            icare<span style={{ color: "var(--dc-accent)" }}>::</span>dev
          </span>
        </div>

        <nav className="flex items-end">
          <button className="dc-tab" data-active={tab === "tables"} onClick={() => setTab("tables")}>
            Tables
          </button>
          <button className="dc-tab" data-active={tab === "users"} onClick={() => setTab("users")}>
            Users
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-3 text-[11.5px]">
          <span className="font-mono" style={{ color: "var(--dc-dim)" }}>
            {email}
          </span>
          {/* A developer need not be an admin — this account is faculty. */}
          <Link href={homeForRole(role)} className="dc-btn">
            Back to app
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
          </Link>
        </div>
      </header>

      {/* Service-role writes: nothing between this page and the tables but Postgres. */}
      <p
        className="border-b px-4 py-1 text-[11px]"
        style={{ borderColor: "var(--dc-line-soft)", background: "#12191a", color: "#6d8388" }}
      >
        Writes here skip every check the app makes — only the database&apos;s own
        constraints apply.
      </p>

      {tab === "tables" ? <TablesPanel /> : <UsersPanel />}
    </div>
  );
}
