import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { supportApi, type SupportUser } from "../../lib/supportApi";

export default function SupportWrapper() {
  const [user, setUser] = useState<SupportUser | null>(null);

  useEffect(() => {
    supportApi.me().then(setUser).catch(() => {});
  }, []);

  return <Outlet context={user} />;
}
