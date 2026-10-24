"use client";

import { useState } from "react";
import { aiCost, aiRate } from "@/app/lib/ai/pricing";
import { SkeletonText } from "../components/skeletons";
import { CARD } from "./ui";
import type { AiUsageRow } from "./metrics";

const WINDOWS = [
  { value: "day", label: "24 h", phrase: "in the last 24 hours" },
  { value: "month", label: "30 days", phrase: "in the last 30 days" },
] as const;

const PROVIDERS: Record<string, string> = { anthropic: "Claude", gemini: "Gemini", openrouter: "OpenRouter" };

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function formatTokens(n: number): string {
  return n < 1000 ? n.toLocaleString() : compact.format(n);
}

function usd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

/** A whole call costs fractions of a cent, so tiny totals read "< $0.01" rather than "$0.00". */
function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value > 0 && value < 0.01) return "< $0.01";
  return usd(value);
}

function formatRate(route: string): string {
  const rate = aiRate(route);
  if (!rate) return "Not listed";
  return rate.free ? "Free" : `${usd(rate.input)} / ${usd(rate.output)}`;
}

function Stat({ label, value, detail, pending }: { label: string; value: string; detail?: string; pending?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      {pending ? (
        <dd>
          <SkeletonText className="mt-1.5 h-6 w-16" />
        </dd>
      ) : (
        <dd className="text-xl font-bold text-gray-800 tabular-nums mt-0.5">{value}</dd>
      )}
      {detail && !pending && <dd className="text-xs text-gray-500 mt-0.5">{detail}</dd>}
    </div>
  );
}

/**
 * Tokens each AI model used and what they cost at list prices (076). Every
 * call is counted, retries and fallbacks included; failed calls use no
 * tokens. Prices come from app/lib/ai/pricing.ts.
 */
export default function AiUsage({
  usage,
  pending,
  migrationPending,
}: {
  usage: { day: AiUsageRow[]; month: AiUsageRow[] } | null | undefined;
  pending: boolean;
  migrationPending: boolean;
}) {
  const [period, setPeriod] = useState<(typeof WINDOWS)[number]["value"]>("month");
  const phrase = WINDOWS.find((w) => w.value === period)!.phrase;

  const rows = (usage?.[period] ?? [])
    .map((r) => ({ ...r, cost: aiCost(r.route, r.input_tokens, r.output_tokens) }))
    .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens));

  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const input = sum((r) => r.input_tokens);
  const output = sum((r) => r.output_tokens);
  const calls = sum((r) => r.requests);
  const cost = sum((r) => r.cost ?? 0);
  // Successful calls logged before 076 carry no token counts.
  const unmetered = sum((r) => Math.max(r.requests - r.errors - r.metered, 0));
  const unpriced = rows.filter((r) => r.cost === null && r.input_tokens + r.output_tokens > 0);

  return (
    <section className={`${CARD} overflow-hidden mb-5`}>
      <div className="p-4 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">AI usage</h2>
          <p className="text-xs text-gray-500">
            Tokens the server sent to and got back from AI providers, and what they cost at list prices
          </p>
        </div>
        {!migrationPending && (
          <div role="radiogroup" aria-label="AI usage window" className="inline-flex rounded-xl border border-hairline bg-surface p-1">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={period === w.value}
                onClick={() => setPeriod(w.value)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  period === w.value ? "bg-brand-600 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {migrationPending ? (
        <div className="px-4 pb-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-800 mb-1">Migration 076 isn&apos;t applied yet</p>
          Apply <code className="font-mono text-xs">web/supabase/migrations/076_ai_token_usage.sql</code> in the Supabase
          SQL editor to start counting tokens. Calls made before then have no token counts.
        </div>
      ) : !usage && !pending ? (
        <p className="px-4 pb-4 text-sm text-rose-700">Couldn&apos;t load AI usage.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 pb-4">
            <Stat
              label="Tokens"
              value={formatTokens(input + output)}
              detail={`${calls.toLocaleString()} ${calls === 1 ? "call" : "calls"}`}
              pending={pending}
            />
            <Stat label="Input" value={formatTokens(input)} detail="Prompts sent" pending={pending} />
            <Stat label="Output" value={formatTokens(output)} detail="Text generated" pending={pending} />
            <Stat
              label="Estimated cost"
              value={formatCost(cost)}
              detail={unpriced.length ? "Priced models only" : "At list prices"}
              pending={pending}
            />
          </dl>

          {/* A floor on the width: on a phone the table scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm whitespace-nowrap">
              <thead className="bg-subtle border-y border-gray-100">
                <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="text-left py-2.5 px-4">Model</th>
                  <th className="text-right py-2.5 px-4">Calls</th>
                  <th className="text-right py-2.5 px-4">Input</th>
                  <th className="text-right py-2.5 px-4">Output</th>
                  <th className="text-right py-2.5 px-4">Rate per 1M · in / out</th>
                  <th className="text-right py-2.5 px-4">Est. cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {pending ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} className="animate-pulse" aria-hidden="true">
                      <td className="py-2.5 px-4">
                        <div className="h-3.5 w-48 rounded bg-gray-100" />
                      </td>
                      {[0, 1, 2, 3, 4].map((j) => (
                        <td key={j} className="py-2.5 px-4">
                          <div className="ml-auto h-3.5 w-12 rounded bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No AI calls {phrase}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const slash = r.route.indexOf("/");
                    const provider = r.route.slice(0, slash);
                    return (
                      <tr key={r.route} className="hover:bg-subtle">
                        <td className="py-2 px-4">
                          <span className="font-medium text-gray-800">{PROVIDERS[provider] ?? provider}</span>
                          <span className="ml-2 font-mono text-xs text-gray-500">{r.route.slice(slash + 1)}</span>
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-700">
                          {r.requests.toLocaleString()}
                          {r.errors > 0 && <span className="ml-1.5 text-xs text-rose-700">{r.errors} failed</span>}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-700" title={`${r.input_tokens.toLocaleString()} tokens`}>
                          {formatTokens(r.input_tokens)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-700" title={`${r.output_tokens.toLocaleString()} tokens`}>
                          {formatTokens(r.output_tokens)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-500">{formatRate(r.route)}</td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium text-gray-900">{formatCost(r.cost)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!pending && (
            <div className="px-4 py-3 border-t border-hairline text-xs text-gray-500 space-y-1">
              <p>
                An estimate from each provider&apos;s list price; the provider&apos;s bill is what counts. Gemini runs on its
                free tier and OpenRouter on free models, so they cost nothing.
              </p>
              {unmetered > 0 && (
                <p>
                  {unmetered.toLocaleString()} successful {unmetered === 1 ? "call" : "calls"} {phrase} came before token
                  counting started, so the totals are low.
                </p>
              )}
              {unpriced.length > 0 && (
                <p>
                  No price is listed for {unpriced.map((r) => r.route).join(", ")}, so the total leaves{" "}
                  {unpriced.length === 1 ? "it" : "them"} out (prices live in app/lib/ai/pricing.ts).
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
