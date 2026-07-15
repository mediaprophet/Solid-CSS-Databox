// @ts-nocheck
import React, { useState } from "react";
import { useCreate } from "@refinedev/core";

export const ProgramCreate = () => {
  const { mutate, isLoading } = useCreate();
  const [formData, setFormData] = useState({
    profileId: "urn:uuid:" + crypto.randomUUID(),
    databoxBaseUrl: "http://localhost:3000/",
    orgName: "New Synthetic Corp",
    orgUrl: "https://synthetic-corp.example",
  });
  const [result, setResult] = useState<any>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate(
      {
        resource: "programs",
        values: {
          profileId: formData.profileId,
          databoxBaseUrl: formData.databoxBaseUrl,
          profile: {
            "@context": "https://schema.org/",
            "@type": "Organization",
            "schema:name": formData.orgName,
            "schema:url": formData.orgUrl,
          },
        },
      },
      {
        onSuccess: (data) => setResult(data.data),
        onError: (err) => alert("Registration failed: " + err.message),
      }
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Onboard Organization</h1>
      <p className="text-slate-400 mb-8">Register a new institution profile directly into the Databox Forge.</p>

      <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl shadow-lg flex flex-col gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Profile ID (URN)</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.profileId}
            onChange={(e) => setFormData({ ...formData, profileId: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Organization Name</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.orgName}
            onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Organization Website (URL)</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.orgUrl}
            onChange={(e) => setFormData({ ...formData, orgUrl: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Target Databox Base URL</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.databoxBaseUrl}
            onChange={(e) => setFormData({ ...formData, databoxBaseUrl: e.target.value })}
            required
          />
          <p className="text-xs text-slate-500 mt-1">Must match the running CSS server's exact base URL.</p>
        </div>
        
        <button type="submit" disabled={isLoading} className="action-btn mt-2 self-start">
          {isLoading ? "Registering..." : "Register Program"}
        </button>
      </form>

      {result && result.programUri && (
        <div className="mt-8 glass-panel p-6 rounded-xl">
          <h3 className="text-xl font-bold text-[#d4af37] mb-4">Registration Successful</h3>
          <p className="text-sm font-semibold text-slate-300">Program URI:</p>
          <div className="bg-black/30 p-4 rounded-lg font-mono text-sm break-all mb-4 border border-white/10">
            {result.programUri}
          </div>
          <p className="text-sm text-slate-400">This organization is now active and ready for customer mapping.</p>
        </div>
      )}
    </div>
  );
};
