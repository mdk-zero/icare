/** Curated subset of the landing page's anchors — every section carries an id,
 *  but a navbar that lists all of them stops being navigation. In page order,
 *  so the active highlight moves left to right as the page scrolls. */
export const SECTION_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How It Works" },
  { id: "features", label: "Features" },
  { id: "who-its-for", label: "Who It’s For" },
  { id: "faq", label: "FAQ" },
] as const;
