// @ts-nocheck
import React from "react";
import { useList, useUpdate } from "@refinedev/core";
import { Link } from "react-router-dom";

const badge = (enabled: boolean) => (
  <span
    className={`px-2 py-1 rounded text-xs font-semibold border ${
      enabled
        ? "bg-green-500/15 text-green-300 border-green-500/40"
        : "bg-slate-500/15 text-slate-300 border-slate-500/40"
    }`}
  >
    {enabled ? "Enabled" : "Disabled"}
  </span>
);

const modeBadge = (mode: string, degraded: boolean) => (
  <span
    className={`px-2 py-1 rounded text-xs font-semibold border ${
      degraded
        ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
        : mode === "css-enhanced"
          ? "bg-violet-500/10 text-violet-200 border-violet-500/25"
          : "bg-sky-500/10 text-sky-200 border-sky-500/25"
    }`}
  >
    {degraded ? `${mode} degraded` : mode}
  </span>
);

export const ModulesPage = () => {
  const { result, query } = useList({
    resource: "cms-modules",
    pagination: { pageSize: 100 },
  });
  const { mutate, isPending } = useUpdate();

  const modules = result?.data ?? [];
  const meta = result?.meta ?? {};
  const toggle = (module: any) => {
    mutate(
      {
        resource: "cms-modules",
        id: module.id,
        values: { enabled: !module.enabled },
      },
      {
        onSuccess: () => query.refetch(),
        onError: (error) => alert("Module update failed: " + error.message),
      }
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">CMS Modules</h1>
      <p className="text-slate-400 mb-8 max-w-3xl">
        Runtime-enabled Solid CMS modules exposed by the active server profile.
      </p>

      {(meta.providerMode === "standard-solid" || meta.degraded) && (
        <div className="mb-5 border border-amber-500/30 bg-amber-500/10 rounded-lg px-4 py-3 text-sm text-amber-100">
          <span className="font-semibold">Portable-core mode</span>
          <span className="text-amber-200/80"> · {meta.degradationReason ?? "CSS-enhanced control-plane actions are unavailable."}</span>
        </div>
      )}

      <div className="glass-panel rounded-xl shadow-lg border border-white/10 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 border-b border-white/10 text-slate-300">
            <tr>
              <th className="p-4 font-semibold">Module</th>
              <th className="p-4 font-semibold">Capabilities</th>
              <th className="p-4 font-semibold">Mode</th>
              <th className="p-4 font-semibold">Routes</th>
              <th className="p-4 font-semibold">Admin</th>
              <th className="p-4 font-semibold">State</th>
              <th className="p-4 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {modules.map((module) => (
              <tr key={module.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4">
                  <p className="font-semibold text-white">{module.name}</p>
                  <p className="font-mono text-xs text-slate-500 mt-1">{module.id}</p>
                  <p className="text-xs text-slate-400 mt-2 max-w-md">{module.description}</p>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {(module.capabilities ?? []).map((capability) => (
                      <span key={capability} className="bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded text-xs font-mono">
                        {capability}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col gap-2">
                    {modeBadge(module.capabilityMode ?? "portable-core", Boolean(module.degraded))}
                    {module.degradationReason && (
                      <span className="text-xs text-slate-500 max-w-[12rem]">{module.degradationReason}</span>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col gap-1">
                    {(module.routes ?? []).map((route) => (
                      <span key={route} className="font-mono text-xs text-slate-400">{route}</span>
                    ))}
                  </div>
                </td>
                <td className="p-4 text-slate-300">
                  {module.adminUi?.path ? (
                    <Link className="text-[#d4af37] hover:text-white font-semibold" to={module.adminUi.path}>
                      {module.adminUi.navLabel}
                    </Link>
                  ) : (
                    <span className="text-slate-500">None</span>
                  )}
                </td>
                <td className="p-4">{badge(module.enabled)}</td>
                <td className="p-4">
                  <button
                    type="button"
                    disabled={isPending || module.controlPlaneAvailable === false}
                    onClick={() => toggle(module)}
                    className="action-btn px-3 py-2 text-xs"
                    title={module.controlPlaneAvailable === false ? "Module toggles require the CSS-enhanced CMS control plane." : undefined}
                  >
                    {module.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {query.isLoading && <div className="p-8 text-center text-slate-500">Loading modules...</div>}
        {!query.isLoading && modules.length === 0 && (
          <div className="p-8 text-center text-slate-500">No CMS modules are exposed by this profile.</div>
        )}
      </div>
    </div>
  );
};
