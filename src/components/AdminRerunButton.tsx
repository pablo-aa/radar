"use client";

// AdminRerunButton — force-reruns the Strategist for admins, bypassing the
// done and running guards. Only rendered when isAdmin is true (evaluated
// server-side by the parent page).

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminRerunButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (loading) return;
    setLoading(true);
    fetch("/api/strategist/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    })
      .then((res) => {
        if (res.ok) router.refresh();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  return (
    <button
      type="button"
      className="btn sm ghost"
      onClick={handleClick}
      disabled={loading}
      style={{ opacity: loading ? 0.5 : 1 }}
    >
      {loading ? "running…" : "re-run strategist"}
    </button>
  );
}
