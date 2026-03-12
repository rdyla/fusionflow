import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const data = await api.dashboardSummary();
      setSummary(data.summary);
      setUser(data.user);
    }

    load();
  }, []);

  if (!summary) return <div>Loading...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>FusionFlow Dashboard</h1>

      <p>Welcome {user?.name}</p>

      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <Card title="Active Projects" value={summary.activeProjects} />
        <Card title="At Risk Projects" value={summary.atRiskProjects} />
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div
      style={{
        padding: 20,
        border: "1px solid #ccc",
        borderRadius: 8,
        minWidth: 200
      }}
    >
      <h3>{title}</h3>
      <p style={{ fontSize: 28 }}>{value}</p>
    </div>
  );
}