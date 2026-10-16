import Link from "next/link";
import Image from "next/image";
import { LEGAL_CONTACT, LEGAL_EFFECTIVE, type LegalDoc, type LegalItem } from "../lib/legal-content";

function Item({ item }: { item: LegalItem }) {
  if (typeof item === "string") return <li>{item}</li>;
  return (
    <li>
      <strong>{item.lead}:</strong> {item.text}
    </li>
  );
}

/**
 * A public legal document (Terms of Use, Privacy Policy), from the same text
 * the mobile app shows on its own screens (lib/legal-content). Open to
 * everyone, signed in or not, so App Store reviewers can read it too.
 */
export default function LegalPage({ doc, other }: { doc: LegalDoc; other: { href: string; label: string } }) {
  return (
    <div className="min-h-screen bg-canvas text-gray-800">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold text-gray-900">
            <Image src="/icon.png" alt="" width={28} height={28} className="rounded-md" />
            iCARE++
          </Link>
          <Link href={other.href} className="text-sm font-medium text-brand-700 hover:underline">
            {other.label}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-gray-500">Effective {LEGAL_EFFECTIVE}</p>
        <div className="mt-6 max-w-[68ch] space-y-3 text-[15px] leading-7 text-gray-700">
          {doc.intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        <nav aria-label="Contents" className="mt-8 rounded-xl border border-hairline bg-surface p-5">
          <p className="text-sm font-semibold text-gray-900">Contents</p>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {doc.sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-brand-700 hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="font-display text-xl font-semibold text-gray-900">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 max-w-[68ch] space-y-3 text-[15px] leading-7 text-gray-700">
                {s.blocks.map((b, j) =>
                  "p" in b ? (
                    <p key={j}>{b.p}</p>
                  ) : (
                    <ul key={j} className="space-y-1.5 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1">
                      {b.list.map((item, k) => (
                        <Item key={k} item={item} />
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-14 border-t border-hairline pt-6 text-sm text-gray-500">
          Questions about this document? Contact {LEGAL_CONTACT}.
        </footer>
      </main>
    </div>
  );
}
