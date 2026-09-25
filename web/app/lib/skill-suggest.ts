import { callAI } from '@/app/lib/ai/generate';
import type { SkillSummary } from '@/app/lib/taylor-skills';

/**
 * Which Taylor's skills a scenario calls for. The AI reads the case against
 * the catalog; when it is unavailable (the free tiers run out daily) a
 * keyword match on the same text still gives faculty a starting point. Either
 * way faculty confirm the list before anything is built from it.
 */

export interface SkillSuggestion {
  id: string;
  reason: string;
}

export const MAX_SUGGESTIONS = 6;

/** Clinical words that point at a skill, for the fallback. */
const KEYWORDS: [RegExp, string[]][] = [
  [/\b(fever|febrile|temperature|hyperthermi|hypothermi|pyrexi)/i, ['1-1']],
  [/\b(infant|neonat|newborn|radiant warmer)/i, ['1-2']],
  [/\b(cooling blanket|hyperthermia unit|heat stroke)/i, ['1-3']],
  [/\b(pulse|tachycardi|bradycardi|heart rate|dehydrat)/i, ['1-4']],
  [/\b(apical|murmur|arrhythmi|irregular heart|digoxin)/i, ['1-5']],
  [/\b(respirat|breathing|dyspn|tachypn|shortness of breath)/i, ['1-6']],
  [/\b(blood pressure|hypertensi|hypotensi|orthostatic|dizz)/i, ['1-7']],
  [/\b(oxygen saturation|spo2|sp02|oximet|hypoxi|asthma|copd|pneumonia)/i, ['14-1']],
  [/\b(incentive spirometer|post-?op|postoperative|atelectasis|appendectomy|surgery)/i, ['14-2']],
  [/\b(nasal cannula|supplemental oxygen|low-flow oxygen)/i, ['14-3']],
  [/\b(oxygen mask|non-?rebreather|venturi|face mask)/i, ['14-4']],
  [/\b(oxygen tent|croup)/i, ['14-5']],
  [/\b(suction|secretions)/i, ['14-6']],
  [/\b(oropharyngeal airway|unconscious|obtunded)/i, ['14-7']],
  [/\b(endotracheal|intubat|ventilat)/i, ['14-8', '14-10']],
  [/\b(tracheostomy|trach\b)/i, ['14-11', '14-12']],
  [/\b(chest tube|chest drain|pneumothorax|hemothorax)/i, ['14-13', '14-14']],
  [/\b(bag.?mask|ambu|apnea|apnoea|respiratory arrest)/i, ['14-15']],
  [/\b(iv\b|intravenous|infusion|dehydrat|fluid resuscitation|pnss|saline)/i, ['15-1', '15-3']],
  [/\b(iv bag|change the (iv|solution)|administration set)/i, ['15-2']],
  [/\b(iv dressing|site dressing)/i, ['15-4']],
  [/\b(saline lock|heparin lock|intermittent (iv|access)|flush)/i, ['15-5']],
  [/\b(transfusion|packed (red )?cells|prbc|anaemi|anemi|hemorrhag|haemorrhag)/i, ['15-6']],
  [/\b(central (venous|line)|cvad|cvc)/i, ['15-7']],
  [/\b(implanted port|port-a-cath|chemotherapy)/i, ['15-8', '15-9']],
  [/\b(picc)/i, ['15-10']],
];

export function keywordSuggestions(text: string, catalog: readonly SkillSummary[]): SkillSuggestion[] {
  const known = new Map(catalog.map((s) => [s.id, s]));
  const hits = new Map<string, string>();
  for (const [pattern, ids] of KEYWORDS) {
    const match = pattern.exec(text);
    if (!match) continue;
    for (const id of ids) {
      if (known.has(id) && !hits.has(id)) hits.set(id, `The case mentions "${match[0].trim()}".`);
    }
  }
  return [...hits.entries()].slice(0, MAX_SUGGESTIONS).map(([id, reason]) => ({ id, reason }));
}

function buildPrompt(caseText: string, catalog: readonly SkillSummary[], lessonText: string | null): string {
  const list = catalog.map((s) => `${s.id}: ${s.title} (${s.area})`).join('\n');
  return `You are a clinical nursing educator. A faculty member is building a simulation scenario and needs to know which Taylor's clinical nursing skills a student must perform in it. Choose ONLY from this catalog (id: title):

${list}

Scenario:
"""
${caseText}
"""
${lessonText ? `\nThe scenario is taught from this lesson; prefer skills the lesson covers:\n"""\n${lessonText}\n"""\n` : ''}
Pick the 2 to ${MAX_SUGGESTIONS} skills the student would actually perform for this patient, most important first. Skip skills that do not fit the case (no infant skills for an adult, no airway suctioning for a patient who is talking).

Return ONLY JSON of this shape, no markdown:
{"skills": [{"id": "1-7", "reason": "one short sentence tying the skill to this patient"}]}`;
}

/** The AI's picks, filtered to real catalog ids; throws when the AI is unavailable. */
export async function aiSuggestions(
  caseText: string,
  catalog: readonly SkillSummary[],
  lessonText: string | null = null,
): Promise<SkillSuggestion[]> {
  const known = new Set(catalog.map((s) => s.id));
  const raw = await callAI(buildPrompt(caseText, catalog, lessonText));
  const list = Array.isArray(raw.skills) ? raw.skills : [];
  const out: SkillSuggestion[] = [];
  for (const item of list) {
    const id = typeof item?.id === 'string' ? item.id.replace(/^skill\s*/i, '').trim() : '';
    if (!known.has(id) || out.some((o) => o.id === id)) continue;
    const reason = typeof item?.reason === 'string' ? item.reason.trim().slice(0, 240) : '';
    out.push({ id, reason });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}
