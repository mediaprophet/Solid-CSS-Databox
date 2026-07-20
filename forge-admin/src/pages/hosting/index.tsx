// @ts-nocheck
import React, { useState } from "react";
import { useCreate } from "@refinedev/core";

const initialForm = {
  apexDomain: "example.org",
  databoxLabel: "databox",
  originTarget: "203.0.113.10",
  wwwEnabled: true,
  proxied: true,
};

const recordClass = (proxied: boolean) =>
  proxied
    ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
    : "bg-sky-500/15 text-sky-200 border-sky-500/40";

export const HostingPage = () => {
  const { mutate, isPending } = useCreate();
  const [form, setForm] = useState(initialForm);
  const [plan, setPlan] = useState<any>(null);

  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    mutate(
      {
        resource: "hosting-plans",
        values: form,
      },
      {
        onSuccess: (data) => setPlan(data.data),
        onError: (error) => alert("Hosting plan failed: " + error.message),
      }
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Hosting</h1>
      <p className="text-slate-400 mb-8 max-w-3xl">
        Generate the DNS records and launch configuration for an opt-in CMS profile.
      </p>

      <form onSubmit={submit} className="glass-panel p-6 rounded-xl shadow-lg grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Apex domain</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={form.apexDomain}
            onChange={(event) => update("apexDomain", event.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Databox label</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={form.databoxLabel}
            onChange={(event) => update("databoxLabel", event.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Origin target</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={form.originTarget}
            onChange={(event) => update("originTarget", event.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-3 glass-input p-3 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={form.wwwEnabled}
              onChange={(event) => update("wwwEnabled", event.target.checked)}
            />
            <span className="text-sm text-slate-200">Reserve www</span>
          </label>
          <label className="flex items-center gap-3 glass-input p-3 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={form.proxied}
              onChange={(event) => update("proxied", event.target.checked)}
            />
            <span className="text-sm text-slate-200">Proxy databox/www</span>
          </label>
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" disabled={isPending} className="action-btn px-6 py-3">
            {isPending ? "Generating..." : "Generate Plan"}
          </button>
        </div>
      </form>

      {plan && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-panel p-5 rounded-xl">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Databox host</p>
              <p className="font-mono text-[#d4af37] break-all">{plan.databoxHost}</p>
            </div>
            <div className="glass-panel p-5 rounded-xl">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Devices host</p>
              <p className="font-mono text-sky-300 break-all">{plan.devicesHost}</p>
            </div>
            <div className="glass-panel p-5 rounded-xl">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Base URL</p>
              <p className="font-mono text-slate-200 break-all">{plan.baseUrl}</p>
            </div>
          </div>

          <div className="glass-panel rounded-xl shadow-lg border border-white/10 overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">DNS Records</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 border-b border-white/10 text-slate-300">
                <tr>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold">Name</th>
                  <th className="p-4 font-semibold">Content</th>
                  <th className="p-4 font-semibold">TTL</th>
                  <th className="p-4 font-semibold">Proxy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {plan.dnsRecords.map((record) => (
                  <tr key={`${record.type}:${record.name}`} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono text-xs text-slate-300">{record.type}</td>
                    <td className="p-4 font-mono text-xs text-white">{record.name}</td>
                    <td className="p-4 font-mono text-xs text-slate-400">{record.content}</td>
                    <td className="p-4 text-xs text-slate-400">{record.ttl === 1 ? "Auto" : record.ttl}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${recordClass(record.proxied)}`}>
                        {record.proxied ? "Proxied" : "DNS only"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass-panel p-5 rounded-xl">
            <h2 className="text-xl font-bold text-white mb-3">Launch Command</h2>
            <div className="bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-sm text-slate-200 break-all">
              {plan.launchCommand}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
