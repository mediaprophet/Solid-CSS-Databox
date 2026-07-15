// @ts-nocheck
import React, { useState } from "react";
import { useCreate } from "@refinedev/core";

export const MappingsSimulator = () => {
  const { mutate, isLoading } = useCreate();
  const [formData, setFormData] = useState({
    profileId: "urn:uuid:1234",
    customerIdNamespace: "internal-crm",
    customerId: "CUST-12345",
    pairwiseWebId: "https://consumer-pod.example/profile/card#test",
  });
  const [result, setResult] = useState<any>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate(
      {
        resource: "mappings",
        values: {
          ...formData,
          sourceSystem: "refine-admin-ui",
          holderPublicJwk: {
            crv: "Ed25519",
            x: "e1ZfJ-H6sM7Wp1x-Z1D9M9u3tW6tHwB2gJ5yM-rC_hM",
            kty: "OKP",
          },
        },
      },
      {
        onSuccess: (data) => setResult(data.data),
        onError: (err) => alert("Mapping failed: " + err.message),
      }
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Provisioning Simulator</h1>
      <p className="text-slate-400 mb-8">Manually provision a customer relationship mapping via the Forge API.</p>

      <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl shadow-lg flex flex-col gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Profile ID (Program)</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.profileId}
            onChange={(e) => setFormData({ ...formData, profileId: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Customer ID Namespace</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.customerIdNamespace}
            onChange={(e) => setFormData({ ...formData, customerIdNamespace: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Synthetic Customer ID</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.customerId}
            onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Consumer Pairwise WebID</label>
          <input
            className="w-full glass-input p-3 rounded-lg"
            value={formData.pairwiseWebId}
            onChange={(e) => setFormData({ ...formData, pairwiseWebId: e.target.value })}
            required
          />
        </div>
        <button type="submit" disabled={isLoading} className="action-btn mt-2 self-start">
          {isLoading ? "Provisioning..." : "Provision Mapping"}
        </button>
      </form>

      {result && result.credential && (
        <div className="mt-8 glass-panel p-6 rounded-xl">
          <h3 className="text-xl font-bold text-[#d4af37] mb-4">Connection Output</h3>
          <p className="text-sm font-semibold text-slate-300">Securing JWS:</p>
          <div className="bg-black/30 p-4 rounded-lg font-mono text-sm break-all max-h-40 overflow-y-auto mb-4 border border-white/10">
            {result.credential.jws}
          </div>
        </div>
      )}
    </div>
  );
};
