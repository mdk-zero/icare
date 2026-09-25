/**
 * Default group names run by letter: Group A, Group B … Group Z, then
 * Group AA, Group AB, and so on (spreadsheet-column style).
 */
export function groupLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    letters = String.fromCharCode(65 + r) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** The first "Group <letter>" not already taken, as the next default name. */
export function nextGroupName(taken: Iterable<string>): string {
  const names = new Set(taken);
  let i = 0;
  while (names.has(`Group ${groupLetter(i)}`)) i++;
  return `Group ${groupLetter(i)}`;
}
