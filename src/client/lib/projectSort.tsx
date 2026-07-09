import { humanize } from "./format";

// Shared sort/filter helpers for the project tables on ProjectsPage and the
// Dashboard, so both behave identically. Sortable columns: project name,
// customer name, status.

export type ProjectSortKey = "name" | "customer" | "status";
export type SortDir = "asc" | "desc";
export type ProjectSort = { key: ProjectSortKey; dir: SortDir } | null;

type SortableProject = { name: string; customer_name: string | null; status: string | null };

function sortValue(p: SortableProject, key: ProjectSortKey): string {
  const raw = key === "name" ? p.name : key === "customer" ? p.customer_name : p.status;
  return (raw ?? "").toLowerCase();
}

/** Stable-ish sort; blank values always sort last regardless of direction. */
export function sortProjects<T extends SortableProject>(list: T[], sort: ProjectSort): T[] {
  if (!sort) return list;
  return [...list].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (av === bv) return 0;
    if (av === "") return 1;
    if (bv === "") return -1;
    const cmp = av < bv ? -1 : 1;
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

/** Toggle helper: same column flips asc⇄desc; a new column starts ascending. */
export function nextSort(prev: ProjectSort, key: ProjectSortKey): ProjectSort {
  if (prev && prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}

/** Distinct status values present in the list, for a filter dropdown. */
export function statusOptions(list: SortableProject[]): string[] {
  return [...new Set(list.map((p) => p.status).filter((s): s is string => !!s))].sort();
}

/** A clickable table header that drives sorting. */
export function SortableTh({
  label,
  colKey,
  sort,
  onSort,
}: {
  label: string;
  colKey: ProjectSortKey;
  sort: ProjectSort;
  onSort: (key: ProjectSortKey) => void;
}) {
  const active = sort?.key === colKey;
  return (
    <th
      onClick={() => onSort(colKey)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, color: active ? "#0891b2" : "#cbd5e1" }}>
        {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

/** A status <select> filter. Empty value = all. */
export function StatusFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      className="ms-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 180 }}
      aria-label="Filter by status"
    >
      <option value="">All statuses</option>
      {options.map((s) => (
        <option key={s} value={s}>{humanize(s)}</option>
      ))}
    </select>
  );
}
