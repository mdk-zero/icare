"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPeopleGroup, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { fetchFacultyTeams, type FacultyTeam } from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import Avatar from "../../components/Avatar";
import { EcgLoader } from "../../components/EcgLoader";
import { usePageData } from "../../lib/use-page-data";

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * The groups an admin has put this faculty member in charge of, section by
 * section. Admins build and change the groups; this page only shows them.
 */
export default function TeamsClient() {
  const { data, loading } = usePageData("faculty:teams", fetchFacultyTeams);

  const mine = (data?.teams ?? []).filter((t) => t.faculty_id === data?.viewer_id);
  const bySection = (data?.sections ?? [])
    .map((section) => ({
      ...section,
      groups: mine.filter((t) => t.section_id === section.id).sort(byName),
    }))
    .filter((section) => section.groups.length > 0);

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faPeopleGroup} className="h-3.5 w-3.5" />,
          label: "Teaching",
        }}
        title="My Groups"
        subtitle="The student groups you supervise, by section. Groups are set up by your admin."
      />

      {loading && !data ? (
        <div className="flex justify-center p-16">
          <EcgLoader size="lg" className="text-brand-600" />
        </div>
      ) : bySection.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-surface p-12 text-center">
          <FontAwesomeIcon icon={faPeopleGroup} className="h-8 w-8 text-gray-300" />
          <p className="mt-3 font-semibold text-gray-700">No groups assigned to you yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Once an admin puts you in charge of a group, it appears here with its students.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {bySection.map((section) => (
            <section key={section.id}>
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-gray-900">
                <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-brand-600" />
                {section.name}
                <span className="text-sm font-normal text-gray-400">
                  {section.groups.length} group{section.groups.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.groups.map((group) => (
                  <GroupCard key={group.id} group={group} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({ group }: { group: FacultyTeam }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
      <p className="mb-3 font-semibold text-gray-900">
        {group.name}{" "}
        <span className="text-xs font-normal text-gray-400">
          {group.members.length} student{group.members.length === 1 ? "" : "s"}
        </span>
      </p>
      {group.members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
          No students in this group yet
        </p>
      ) : (
        <ul className="space-y-1">
          {group.members.map((member) => (
            <li key={member.id}>
              <Link
                href={`/faculty/students/${member.id}`}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-subtle"
              >
                <Avatar name={member.name} src={member.picture_url} userId={member.id} sex={member.sex} size="sm" />
                <span className="truncate text-sm text-gray-800">{member.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
