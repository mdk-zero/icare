"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import CaseGrader from "../../case-grader";

/** A direct link to one student's case (a notification, an older bookmark). */
export default function CaseGradingClient({ submissionId }: { submissionId: string }) {
  return (
    <div className="space-y-4">
      <Link href="/instructor/cases" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700">
        <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" /> Case Presentations
      </Link>
      <CaseGrader submissionId={submissionId} />
    </div>
  );
}
