// @ts-nocheck
import React, { useState } from "react";
import { useCreate } from "@refinedev/core";

export const EventDispatcher = () => {
  const { mutate, isLoading } = useCreate();
  const [formData, setFormData] = useState({
    profileId: "urn:uuid:1234",
    customerId: "CUST-12345",
    eventType: "system-update",
    recordClass: "rc-note",
    payloadString: '{"message": "Hello from Refine UI", "timestamp": "2026-07-16T00:00:00Z"}',
  });
  const [result, setResult] = useState<any>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(formData.payloadString);
    } catch {
      alert("Payload must be valid JSON");
      return;
    }

    mutate(
      {
        resource: "source-events",
        values: {
          profileId: formData.profileId,
          sourceSystem: "refine-admin-ui",
          eventType: formData.eventType,
          sourceEventId: "MANUAL-" + Date.now(),
          customerIdNamespace: "internal-crm",
          customerId: formData.customerId,
          recordClass: formData.recordClass,
          legalBasis: "lb-consent",
          purpose: "p-service",
          payload: parsedPayload,
        },
      },
      {
        onSuccess: (data) => setResult(data.data),
        onError: (err) => alert("Dispatch failed: " + err.message),
      }
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Event Dispatcher</h1>
      <p className="text-slate-400 mb-8">Inject institutional source-events into a Databox stream.</p>

      <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl shadow-lg flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Profile ID (Program)</label>
            <input
              className="w-full glass-input p-3 rounded-lg"
              value={formData.profileId}
              onChange={(e) => setFormData({ ...formData, profileId: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Customer ID</label>
            <input
              className="w-full glass-input p-3 rounded-lg"
              value={formData.customerId}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Event Type</label>
            <input
              className="w-full glass-input p-3 rounded-lg"
              value={formData.eventType}
              onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Record Class</label>
            <input
              className="w-full glass-input p-3 rounded-lg"
              value={formData.recordClass}
              onChange={(e) => setFormData({ ...formData, recordClass: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Payload (JSON)</label>
          <textarea
            className="w-full glass-input p-3 rounded-lg font-mono text-sm"
            rows={5}
            value={formData.payloadString}
            onChange={(e) => setFormData({ ...formData, payloadString: e.target.value })}
          />
        </div>
        <button type="submit" disabled={isLoading} className="action-btn mt-2 self-start">
          {isLoading ? "Dispatching..." : "Dispatch Event"}
        </button>
      </form>

      {result && (
        <div className="mt-8 glass-panel p-6 rounded-xl">
          <h3 className="text-xl font-bold text-[#d4af37] mb-4">Dispatch Receipt</h3>
          <p className="text-sm font-semibold text-slate-300">
            Reconciliation Status:{" "}
            <span className="bg-[#d4af37]/15 text-[#d4af37] px-3 py-1 rounded-full text-xs font-bold ml-2">
              {result.status || "unknown"}
            </span>
          </p>
          <div className="bg-black/30 p-4 rounded-lg font-mono text-sm break-all max-h-40 overflow-y-auto mt-4 border border-white/10">
            {result.receipt?.jws || "No receipt returned"}
          </div>
        </div>
      )}
    </div>
  );
};
