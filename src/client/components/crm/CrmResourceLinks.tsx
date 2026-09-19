import { crmRecordUrl, type CrmEntity } from "../../../shared/crmLinks";

/** Roles that must never see a CRM link: customers and partner AEs have no
 *  Dynamics access, so a link would only ever be a dead end for them. Mirrors
 *  the server's isExternalRole. */
const EXTERNAL_ROLES = new Set(["client", "partner_ae"]);

type Props = {
  /** Current user's role — links render only for internal Packet Fusion staff. */
  role: string;
  caseId?: string | null;
  opportunityId?: string | null;
  accountId?: string | null;
};

/**
 * "Open in CRM" links for the Dynamics records behind a project or solution.
 *
 * Renders nothing at all when the viewer is external, or when none of the ids
 * are set. Individual links are omitted rather than disabled: roughly a third
 * of projects have no case or opportunity linked, and a row of greyed-out
 * buttons reads as broken rather than as "not linked yet".
 */
export default function CrmResourceLinks({ role, caseId, opportunityId, accountId }: Props) {
  if (EXTERNAL_ROLES.has(role)) return null;

  const links: Array<{ label: string; url: string }> = [];
  const add = (label: string, entity: CrmEntity, id: string | null | undefined) => {
    const url = crmRecordUrl(entity, id);
    if (url) links.push({ label, url });
  };
  add("Opportunity", "opportunity", opportunityId);
  add("Case", "case", caseId);
  add("Account", "account", accountId);

  if (links.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
      <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>CRM:</span>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open this ${l.label.toLowerCase()} in Dynamics 365`}
          style={{ fontSize: 12, color: "#0b9aad", textDecoration: "none", fontWeight: 600 }}
        >
          {l.label} <span style={{ fontSize: 10 }}>↗</span>
        </a>
      ))}
    </div>
  );
}
