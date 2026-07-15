// @ts-nocheck
import React, { useState, useEffect } from "react";
import { useCreate } from "@refinedev/core";

const ANZSIC_DIVISIONS = [
  { id: "A", name: "Agriculture, Forestry and Fishing" },
  { id: "B", name: "Mining" },
  { id: "C", name: "Manufacturing" },
  { id: "D", name: "Electricity, Gas, Water and Waste Services" },
  { id: "E", name: "Construction" },
  { id: "F", name: "Wholesale Trade" },
  { id: "G", name: "Retail Trade" },
  { id: "H", name: "Accommodation and Food Services" },
  { id: "I", name: "Transport, Postal and Warehousing" },
  { id: "J", name: "Information Media and Telecommunications" },
  { id: "K", name: "Financial and Insurance Services" },
  { id: "L", name: "Rental, Hiring and Real Estate Services" },
  { id: "M", name: "Professional, Scientific and Technical Services" },
  { id: "N", name: "Administrative and Support Services" },
  { id: "O", name: "Public Administration and Safety" },
  { id: "P", name: "Education and Training" },
  { id: "Q", name: "Health Care and Social Assistance" },
  { id: "R", name: "Arts and Recreation Services" },
  { id: "S", name: "Other Services" },
];

const ALL_CAPABILITIES = [
  { id: "cap-receipt", name: "Digital Receipts" },
  { id: "cap-warranty", name: "Warranty Claims" },
  { id: "cap-recall", name: "Recalls" },
  { id: "cap-usage", name: "Usage Statements" },
  { id: "cap-invoice", name: "Invoices" },
  { id: "cap-menu", name: "Menu Ordering" },
  { id: "cap-diet", name: "Dietary Preferences" },
  { id: "cap-qual", name: "Portable Qualifications" },
  { id: "cap-enrol", name: "Enrolment Records" },
  { id: "cap-membership", name: "Membership" },
  { id: "cap-access", name: "Time-bound Access" },
  { id: "cap-notification", name: "Service Notifications" },
];

const recommendCapabilities = (divisionId: string) => {
  switch (divisionId) {
    case "D":
      return ["cap-usage", "cap-invoice", "cap-notification"];
    case "G":
      return ["cap-receipt", "cap-warranty", "cap-recall"];
    case "H":
      return ["cap-menu", "cap-diet", "cap-receipt"];
    case "K":
      return ["cap-receipt", "cap-access"];
    case "P":
      return ["cap-qual", "cap-enrol"];
    case "Q":
      return ["cap-access", "cap-invoice"];
    case "R":
      return ["cap-membership", "cap-qual", "cap-access"];
    default:
      return ["cap-receipt", "cap-invoice"];
  }
};

export const SetupPage = () => {
  const { mutate, isLoading } = useCreate();
  const [formData, setFormData] = useState({
    profileId: "urn:uuid:" + crypto.randomUUID(),
    databoxBaseUrl: "http://localhost:3000/",
    orgName: "New Enterprise",
    orgUrl: "https://enterprise.example",
    industry: "G",
  });
  
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);

  // When industry changes, automatically recommend capabilities
  useEffect(() => {
    setSelectedCapabilities(recommendCapabilities(formData.industry));
  }, [formData.industry]);

  const toggleCapability = (capId: string) => {
    if (selectedCapabilities.includes(capId)) {
      setSelectedCapabilities(selectedCapabilities.filter(id => id !== capId));
    } else {
      setSelectedCapabilities([...selectedCapabilities, capId]);
    }
  };

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
            "schema:knowsAbout": `https://w3id.org/anzsic/2006/role/${formData.industry}`,
            "capabilities": selectedCapabilities
          },
        },
      },
      {
        onSuccess: (data) => setResult(data.data),
        onError: (err) => alert("Setup failed: " + err.message),
      }
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Organization Set-up</h1>
      <p className="text-slate-400 mb-8">Define your organization type and supported communication channels.</p>

      <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl shadow-lg flex flex-col md:flex-row gap-8">
        
        {/* Left Column: Organization Details */}
        <div className="flex-1 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-white mb-2 border-b border-white/10 pb-2">Identity</h2>
          
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
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Profile ID (URN)</label>
            <input
              className="w-full glass-input p-3 rounded-lg text-slate-500"
              value={formData.profileId}
              readOnly
            />
          </div>
        </div>

        {/* Right Column: Taxonomy & Capabilities */}
        <div className="flex-1 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-white mb-2 border-b border-white/10 pb-2">Classification & Capabilities</h2>
          
          <div>
            <label className="block text-sm text-[#d4af37] mb-1 font-semibold">Industry Segment (ANZSIC)</label>
            <select
              className="w-full glass-input p-3 rounded-lg text-white appearance-none"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
            >
              {ANZSIC_DIVISIONS.map(div => (
                <option key={div.id} value={div.id} className="bg-slate-900">
                  {div.id} - {div.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-sm text-slate-400 mb-3">Supported Communications</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_CAPABILITIES.map(cap => {
                const isChecked = selectedCapabilities.includes(cap.id);
                return (
                  <div key={cap.id} 
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${isChecked ? 'bg-[#d4af37]/20 border border-[#d4af37]/50' : 'glass-input'}`}
                    onClick={() => toggleCapability(cap.id)}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${isChecked ? 'bg-[#d4af37] border-[#d4af37]' : 'border-slate-500'}`}>
                      {isChecked && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className={`text-sm ${isChecked ? 'text-white font-medium' : 'text-slate-400'}`}>{cap.name}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-4 italic">
              * Changing your industry segment automatically recommends a standard set of capabilities.
            </p>
          </div>
        </div>
      </form>

      <div className="mt-6 flex justify-end">
        <button onClick={handleSubmit} disabled={isLoading} className="action-btn text-lg px-8 py-3">
          {isLoading ? "Provisioning Setup..." : "Complete Setup"}
        </button>
      </div>

      {result && result.programUri && (
        <div className="mt-8 glass-panel p-6 rounded-xl border border-green-500/30 bg-green-500/5">
          <h3 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Setup Provisioned Successfully
          </h3>
          <p className="text-sm font-semibold text-slate-300">Program Context URI:</p>
          <div className="bg-black/40 p-4 rounded-lg font-mono text-sm break-all mb-4 border border-white/10 mt-2">
            {result.programUri}
          </div>
          <p className="text-sm text-slate-400">Your organization taxonomy and communication capabilities have been written to the databox ledger.</p>
        </div>
      )}
    </div>
  );
};
