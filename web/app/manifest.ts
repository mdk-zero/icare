import type { MetadataRoute } from "next";

/**
 * What a phone uses when the portal is added to its home screen: a short name
 * that fits under the icon, and the iCARE++ icon on white. The student web app
 * has its own (public/student/manifest.webmanifest).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iCARE++ Clinical Competency Platform",
    short_name: "iCARE++",
    description:
      "A scalable machine learning-driven clinical competency assessment and adaptive learning system for nursing students.",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#1b6b7b",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
