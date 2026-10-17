import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

/**
 * The way out of the auth screens back to the landing page. Built from the
 * same white/accent tokens as the glass card, which .auth-screen re-points
 * for light mode, so it reads on either backdrop.
 */
export default function AuthHomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium text-white/70 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-(--auth-accent)/40 ${className}`}
    >
      <FontAwesomeIcon
        icon={faArrowLeft}
        className="h-3.5 w-3.5 text-(--auth-accent) transition-transform motion-safe:group-hover:-translate-x-0.5"
      />
      Back to home
    </Link>
  );
}
