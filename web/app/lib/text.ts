/**
 * Text cut to at most `max` characters, ending in "…". For places that can't
 * show a tooltip, like a native <select>'s options; elsewhere a long course
 * title goes through TruncatedText, which shows the whole of it on hover.
 */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
