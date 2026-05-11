// Convert snake_case / kebab-case enum-style strings into Title Case for display.
// e.g. "not_started" → "Not Started", "on_track" → "On Track", null → "—".
export function humanize(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
