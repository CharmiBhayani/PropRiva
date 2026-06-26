import React, { useState } from "react";
import LandlordDashboard from "./LandlordDashboard";
import TenantDashboard from "./TenantDashboard";
import { Building2, Key } from "lucide-react";

const tabs = [
  { id: "landlord", label: "Landlord Portal", icon: Building2 },
  { id: "tenant",   label: "Tenant Portal",   icon: Key },
];

export default function Dashboard() {
  const [active, setActive] = useState("landlord");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 flex flex-col gap-7">

      {/* Tab switcher */}
      <div className="flex justify-center">
        <div
          className="inline-flex p-1 rounded-2xl"
          style={{
            background: "var(--c-surface-3)",
            border: "1px solid var(--c-border)",
          }}
          role="tablist"
          aria-label="Dashboard portals"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(id)}
                className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 cursor-pointer"
                style={{
                  background: isActive ? "var(--c-surface)" : "transparent",
                  color: isActive ? "var(--c-brand)" : "var(--c-text-3)",
                  boxShadow: isActive ? "var(--shadow-sm)" : "none",
                  border: isActive ? "1px solid var(--c-border)" : "1px solid transparent",
                }}
              >
                <Icon
                  size={14}
                  strokeWidth={isActive ? 2.5 : 2}
                  style={{ color: isActive ? "var(--c-brand)" : "var(--c-text-4)" }}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel */}
      <div
        className="flex-1 flex flex-col"
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
      >
        {active === "landlord" ? <LandlordDashboard /> : <TenantDashboard />}
      </div>
    </div>
  );
}
