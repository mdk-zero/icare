import type { Metadata } from "next";
import RoomsBoard from "../../components/RoomsBoard";

export const metadata: Metadata = {
  title: "Wards | iCARE++",
};

/**
 * Wards as the instructors see them (098): each room and the patient cases
 * and Return Demonstrations assigned to it, by group, for all the Dean's
 * students. Arranging the floor plan, managing rooms and the patient census
 * are a click away, under Rooms & layout.
 */
export default function AdminWardsPage() {
  return <RoomsBoard layoutHref="/dean/wards/layout" />;
}
