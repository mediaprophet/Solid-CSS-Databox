// @ts-nocheck
import React, { useState } from "react";
import { Refine, useList, useCreate } from "@refinedev/core";
import { BrowserRouter, Route, Routes, NavLink, Outlet } from "react-router-dom";
import routerProvider from "@refinedev/react-router-v6";
import { dataProvider } from "./providers/dataProvider";
import "./index.css";

// Layout Component
const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen w-full bg-[#020617] text-[#f8fafc]">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 glass-panel border-r border-white/5 p-6 z-10 flex flex-col">
        <h2 className="text-[#d4af37] text-2xl font-bold mb-8 text-center">Forge Admin</h2>
        <nav className="flex flex-col gap-2">
          <NavLink
            to="/programs"
            className={({ isActive }) =>
              `p-3 rounded-lg font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            Programs
          </NavLink>
          <NavLink
            to="/mappings"
            className={({ isActive }) =>
              `p-3 rounded-lg font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            Mappings Simulator
          </NavLink>
          <NavLink
            to="/events"
            className={({ isActive }) =>
              `p-3 rounded-lg font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            Event Dispatcher
          </NavLink>
        </nav>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 overflow-y-auto p-10"
        style={{
          background: "radial-gradient(circle at top right, rgba(212, 175, 55, 0.05) 0%, transparent 40%)",
        }}
      >
        <Outlet />
        {children}
      </div>
    </div>
  );
};

// Programs View
const ProgramsList = () => {
  const { data, isLoading, isError } = useList({ resource: "programs" });

  if (isLoading) return <div>Loading programs...</div>;
  if (isError) return <div className="text-red-500">Error fetching programs. Ensure CSS backend is running on port 3000.</div>;

  const programs = data?.data || [];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-bold mb-2">Registered Programs</h1>
      <p className="text-slate-400 mb-8">Manage organizations currently provisioned through the Databox Forge.</p>

      {programs.length === 0 ? (
        <div className="text-slate-400 text-center p-8 glass-panel rounded-xl">
          No programs registered. Use the interactive demos to provision one.
        </div>
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[#d4af37]">
                <th className="p-4 font-semibold border-b border-white/5">Organization</th>
                <th className="p-4 font-semibold border-b border-white/5">Program URI</th>
                <th className="p-4 font-semibold border-b border-white/5">Databox Route</th>
                <th className="p-4 font-semibold border-b border-white/5">Status</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => {
                const pName = p.profile?.name || p.profile?.["schema:name"] || "Unknown Org";
                return (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 border-b border-white/5">
                      <strong className="block">{pName}</strong>
                      <span className="text-xs text-slate-400">{p.profileId}</span>
                    </td>
                    <td className="p-4 border-b border-white/5">
                      <a href={p.programUri} target="_blank" rel="noreferrer" className="text-[#d4af37] hover:underline">
                        {p.programUri}
                      </a>
                    </td>
                    <td className="p-4 border-b border-white/5 font-mono text-sm">{p.databoxBaseUrl}</td>
                    <td className="p-4 border-b border-white/5">
                      <span className="bg-[#d4af37]/15 text-[#d4af37] px-3 py-1 rounded-full text-xs font-bold">
                        Active
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Mappings View
const MappingsSimulator = () => {
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

// Events View
const EventDispatcher = () => {
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

function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider}
        routerProvider={routerProvider}
        resources={[
          { name: "programs", list: "/programs" },
          { name: "mappings", create: "/mappings" },
          { name: "events", create: "/events" },
        ]}
      >
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ProgramsList />} />
            <Route path="/programs" element={<ProgramsList />} />
            <Route path="/mappings" element={<MappingsSimulator />} />
            <Route path="/events" element={<EventDispatcher />} />
          </Route>
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}

export default App;
