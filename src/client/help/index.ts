// Contextual help content. Markdown docs live in ./content/*.md and are bundled
// at build time. To add or refine help for a page: edit/add a .md file and (if
// it's a new key) add a matcher to ROUTES below. Most-specific matchers first.
import { renderMarkdown } from "./renderMarkdown";

const raw = import.meta.glob("./content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// key (filename without extension) -> markdown source
const DOCS: Record<string, string> = {};
for (const [path, md] of Object.entries(raw)) {
  const key = path.replace(/^.*\/([^/]+)\.md$/, "$1");
  DOCS[key] = md;
}

type Matcher = { key: string; title: string; test: (path: string) => boolean };

// Per-page → help doc. Order matters: detail/sub-routes before their list pages.
const ROUTES: Matcher[] = [
  { key: "project-detail", title: "Project detail help", test: (p) => /^\/(projects|dashboard)\/[^/]+/.test(p) },
  { key: "projects", title: "Projects help", test: (p) => p === "/dashboard" || p.startsWith("/projects") },
  { key: "solutions", title: "Solutions help", test: (p) => p.startsWith("/solutions") },
  { key: "optimize", title: "Optimize help", test: (p) => p.startsWith("/optimize") },
  { key: "support", title: "Support help", test: (p) => p.startsWith("/support") },
  { key: "customers", title: "Customers help", test: (p) => p.startsWith("/customers") },
  { key: "admin", title: "Admin help", test: (p) => p.startsWith("/admin") },
];

export type ResolvedHelp = {
  /** top-level section, for triage on the request (e.g. "projects") */
  module: string;
  title: string;
  /** rendered HTML from the matched markdown doc */
  html: string;
};

export function resolveHelp(pathname: string): ResolvedHelp {
  const module = pathname.split("/").filter(Boolean)[0] || "home";
  const match = ROUTES.find((r) => r.test(pathname));
  const key = match?.key ?? "home";
  const md = DOCS[key] ?? DOCS.home ?? "## Help\n\nNo help is available for this page yet.";
  return {
    module,
    title: match?.title ?? "CloudConnect help",
    html: renderMarkdown(md),
  };
}
