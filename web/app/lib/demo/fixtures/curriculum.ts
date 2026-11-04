import {
  catalogOf,
  readImportedCurriculum,
  requisiteRows,
  type CatalogCourse,
  type CurriculumAnalysis,
  type CurriculumCourseRow,
  type ImportedCurriculum,
} from "../../curriculum";
import { DEAN_ID, KIND, ago, demoId } from "./people";

/**
 * The Dean's curriculum (migration 089). Written the way the AI reads a PDF, and
 * put through the same code, so the demo's courses are shaped exactly like a
 * real import. A demo's "upload" reads the same plan with a few faults added,
 * since no AI runs in the browser.
 */

export interface DemoCurriculum {
  id: string;
  admin_id: string;
  name: string;
  is_active: boolean;
  source_name: string | null;
  analysis: CurriculumAnalysis;
  created_at: string;
  courses: CurriculumCourseRow[];
}

type Row = [string, string, number, number, string[]?, string[]?];

const term = (year: number, termNo: number, courses: Row[], stated: number | null = null) => ({
  year,
  term: termNo,
  stated_units: stated,
  courses: courses.map(([code, title, lec, lab, pre = [], co = []]) => [code, title, lec, lab, pre, co]),
});

/** A BSN plan following CMO 15, with the lab titles of the app's built-in list. */
const BSN_TERMS = [
  term(1, 1, [
    ["GE 1", "Understanding the Self", 3, 0],
    ["GE 2", "Readings in Philippine History", 3, 0],
    ["GE 3", "The Contemporary World", 3, 0],
    ["GE 4", "Mathematics in the Modern World", 3, 0],
    ["BIO 101", "Anatomy and Physiology", 3, 2],
    ["CHEM 101", "Biochemistry", 3, 2],
    ["NCM 100", "Theoretical Foundations in Nursing", 3, 0],
    ["PATHFIT 1", "Movement Competency Training", 2, 0],
    ["NSTP 1", "National Service Training Program 1", 3, 0],
  ]),
  term(1, 2, [
    ["GE 5", "Purposive Communication", 3, 0],
    ["GE 6", "Art Appreciation", 3, 0],
    ["GE 7", "Science, Technology and Society", 3, 0],
    ["BIO 102", "Microbiology and Parasitology", 2, 1, ["BIO 101"]],
    ["NCM 101", "Health Assessment", 3, 0, ["NCM 100"], ["NCM 101L"]],
    ["NCM 101L", "Health Assessment (Skills Lab)", 0, 1, [], ["NCM 101"]],
    ["NCM 102", "Health Education", 3, 0, ["NCM 100"]],
    ["NCM 103", "Fundamentals of Nursing Practice", 3, 0, ["NCM 100"], ["NCM 103L"]],
    ["NCM 103L", "Fundamentals of Nursing Practice (Skills Lab)", 0, 2, [], ["NCM 103"]],
    ["PATHFIT 2", "Exercise-Based Fitness Activities", 2, 0, ["PATHFIT 1"]],
    ["NSTP 2", "National Service Training Program 2", 3, 0, ["NSTP 1"]],
  ]),
  term(2, 1, [
    ["GE 8", "Ethics", 3, 0],
    ["NCM 104", "Community Health Nursing (Individual and Family as Clients)", 2, 0, ["NCM 103"], ["NCM 104L"]],
    ["NCM 104L", "Community Health Nursing (Individual and Family as Clients) (RLE and Skills Lab)", 0, 3, ["NCM 103L"], ["NCM 104"]],
    ["NCM 105", "Nutrition and Diet Therapy", 2, 0, ["CHEM 101"], ["NCM 105L"]],
    ["NCM 105L", "Nutrition and Diet Therapy (Skills Lab)", 0, 1, [], ["NCM 105"]],
    ["NCM 106", "Pharmacology", 3, 0, ["NCM 103"]],
    ["NCM 107", "Care of Mother, Child, and Adolescent", 3, 0, ["NCM 103"], ["NCM 107L"]],
    ["NCM 107L", "Care of Mother, Child, and Adolescent (RLE and Skills Lab)", 0, 3, ["NCM 103L"], ["NCM 107"]],
    ["PATHFIT 3", "Menu of Dance, Sports and Group Exercise", 2, 0, ["PATHFIT 2"]],
  ]),
  term(2, 2, [
    ["GE 9", "Life and Works of Rizal", 3, 0],
    ["NCM 108", "Health Care Ethics (Bioethics)", 2, 0],
    ["NCM 109", "Care of Mother, Child, at Risk or With Problems (Acute and Chronic)", 3, 0, ["NCM 107"], ["NCM 109L"]],
    ["NCM 109L", "Care of Mother, Child, at Risk or With Problems (Acute and Chronic) - Skills Lab and RLE", 0, 3, ["NCM 107L"], ["NCM 109"]],
    ["NCM 110", "Nursing Informatics", 1, 0, [], ["NCM 110L"]],
    ["NCM 110L", "Nursing Informatics (Lab)", 0, 1, [], ["NCM 110"]],
    ["NCM 111", "Nursing Research 1", 2, 0],
    ["PATHFIT 4", "Menu of Dance, Sports and Group Exercise", 2, 0, ["PATHFIT 3"]],
  ]),
  term(3, 1, [
    ["NCM 112", "Care of Clients With Problems in Oxygenation, Fluid and Electrolytes, Infectious, Inflammatory and Immunologic Response, Cellular Aberrations, Acute and Chronic", 4, 0, ["NCM 109"], ["NCM 112L"]],
    ["NCM 112L", "Care of Clients With Problems in Oxygenation, Fluid and Electrolytes, Infectious, Inflammatory and Immunologic Response, Cellular Aberrations, Acute and Chronic (Skills Lab and RLE)", 0, 4, ["NCM 109L"], ["NCM 112"]],
    ["NCM 113", "Community Health Nursing 2 (Population Groups and Community as Clients)", 2, 0, ["NCM 104"], ["NCM 113L"]],
    ["NCM 113L", "Community Health Nursing 2 (Population Groups and Community as Clients) - RLE", 0, 2, ["NCM 104L"], ["NCM 113"]],
    ["NCM 114", "Care of Older Person", 2, 0, ["NCM 107"], ["NCM 114L"]],
    ["NCM 114L", "Care of Older Person", 0, 1, [], ["NCM 114"]],
  ]),
  term(3, 2, [
    ["NCM 115", "Nursing Research 2", 1, 0, ["NCM 111"], ["NCM 115L"]],
    ["NCM 115L", "Nursing Research 2 (RLE)", 0, 1, [], ["NCM 115"]],
    ["NCM 116", "Care of Clients With Problems in Nutrition and Gastrointestinal Metabolism and Endocrine, Perception and Coordination, Acute and Chronic", 4, 0, ["NCM 112"], ["NCM 116L"]],
    ["NCM 116L", "Care of Clients With Problems in Nutrition and Gastrointestinal Metabolism and Endocrine, Perception and Coordination, Acute and Chronic (Skills Lab and RLE)", 0, 4, ["NCM 112L"], ["NCM 116"]],
    ["NCM 117", "Care of Clients With Maladaptive Patterns of Behavior, Acute and Chronic", 2, 0, ["NCM 112"], ["NCM 117L"]],
    ["NCM 117L", "Care of Clients With Maladaptive Patterns of Behavior, Acute and Chronic (RLE)", 0, 2, ["NCM 112L"], ["NCM 117"]],
  ]),
  term(4, 1, [
    ["NCM 118", "Nursing Care of Clients With Life-threatening Conditions, Acutely-Ill, Multi-Organ Problems, High Acuity and Emergency Situations, Acute and Chronic", 4, 0, ["NCM 116"], ["NCM 118L"]],
    ["NCM 118L", "Nursing Care of Clients With Life-threatening Conditions, Acutely-Ill, Multi-Organ Problems, High Acuity and Emergency Situations, Acute and Chronic (RLE and Skills Lab)", 0, 4, ["NCM 116L"], ["NCM 118"]],
    ["NCM 119", "Nursing Leadership and Management", 3, 0, ["NCM 116"], ["NCM 119L"]],
    ["NCM 119L", "Nursing Leadership and Management (RLE)", 0, 2, ["NCM 116L"], ["NCM 119"]],
  ]),
  term(4, 2, [
    ["NCM 120", "Decent Work Employment and Transcultural Nursing", 1, 0],
    ["NCM 121", "Disaster Nursing", 2, 0, ["NCM 118"], ["NCM 121L"]],
    ["NCM 121L", "Disaster Nursing (Skills Lab)", 0, 1, ["NCM 118L"], ["NCM 121"]],
    ["NCM 122", "Intensive Nursing Practicum", 0, 6, ["4th Year Standing"]],
  ]),
];

function toDemo(
  reading: ImportedCurriculum,
  makeId: (n: number) => string,
  fields: Pick<DemoCurriculum, "id" | "admin_id" | "is_active" | "source_name" | "created_at">,
): DemoCurriculum {
  const idOf = new Map(reading.courses.map((c, i) => [c.code, makeId(i)]));
  const ids = (codes: string[]) => codes.map((code) => idOf.get(code)).filter((id): id is string => !!id);
  const links = requisiteRows(
    reading.courses.map((c) => ({
      id: idOf.get(c.code) as string,
      prerequisite_ids: ids(c.prerequisites),
      corequisite_ids: ids(c.corequisites),
    })),
  );
  return {
    ...fields,
    name: reading.name,
    analysis: reading.analysis,
    courses: reading.courses.map((c) => {
      const id = idOf.get(c.code) as string;
      const mine = links.filter((l) => l.course_id === id);
      return {
        id,
        code: c.code,
        title: c.title,
        year_level: c.year_level,
        term: c.term,
        lecture_units: c.lecture_units,
        lab_units: c.lab_units,
        requisite_note: c.requisite_note,
        position: c.position,
        prerequisite_ids: mine.filter((l) => l.kind === "pre").map((l) => l.requires_id),
        corequisite_ids: mine.filter((l) => l.kind === "co").map((l) => l.requires_id),
      };
    }),
  };
}

export function seedCurriculum(): { curricula: DemoCurriculum[] } {
  const reading = readImportedCurriculum({ name: "BS Nursing Curriculum, AY 2023-2024", terms: BSN_TERMS, notes: [] }, "");
  return {
    curricula: [
      toDemo(reading, (n) => demoId(KIND.misc, 9000 + n), {
        id: demoId(KIND.misc, 8900),
        admin_id: DEAN_ID,
        is_active: true,
        source_name: null,
        created_at: ago(120),
      }),
    ],
  };
}

/**
 * What a demo's upload "reads": the same plan, with the faults a real reading
 * can have, so the checks have something to show. A total that doesn't match,
 * a pre-requisite in the wrong order, one that names no course here, and a note.
 */
export function demoReading(owner: string, makeId: () => string, fileName: string, createdAt: string): DemoCurriculum {
  const terms = structuredClone(BSN_TERMS) as typeof BSN_TERMS;
  terms[0].stated_units = 25;
  terms[1].stated_units = 28;
  terms[1].courses = terms[1].courses.filter((row) => row[0] !== "NCM 102");
  const place = terms[4].courses.find((row) => row[0] === "NCM 113");
  if (place) place[4] = ["NCM 116"];
  const research = terms[3].courses.find((row) => row[0] === "NCM 111");
  if (research) research[4] = ["STAT 101"];
  const reading = readImportedCurriculum(
    {
      name: fileName.replace(/\.pdf$/i, "") || "Uploaded curriculum",
      terms,
      notes: ["The units for NCM 114L were hard to read. Check them against the PDF."],
    },
    "",
  );
  return toDemo(reading, () => makeId(), {
    id: makeId(),
    admin_id: owner,
    is_active: false,
    source_name: fileName,
    created_at: createdAt,
  });
}

/** What Assign Course offers for a demo Dean, as GET /api/admin/courses reports it. */
export function demoCatalog(curricula: DemoCurriculum[] | undefined, owner: string): CatalogCourse[] | null {
  const active = (curricula ?? []).find((c) => c.admin_id === owner && c.is_active);
  const catalog = catalogOf(active?.courses ?? []);
  return catalog.length ? catalog : null;
}
