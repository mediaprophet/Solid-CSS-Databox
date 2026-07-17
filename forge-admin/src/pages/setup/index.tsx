// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCreate } from "@refinedev/core";
import { InformationCategories } from "./InformationCategories";
import { INFO_CATEGORIES, recommendCategories, vocabFor } from "../../data/informationCategories";

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

export const SetupPage = () => {
  const { mutate, isPending: isLoading } = useCreate();
  const [formData, setFormData] = useState({
    profileId: "urn:uuid:" + crypto.randomUUID(),
    databoxBaseUrl: "http://localhost:3000/",
    orgName: "New Enterprise",
    orgUrl: "https://enterprise.example",
    industry: "G",
  });
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>(recommendCategories("G"));
  const [selectedOntologies, setSelectedOntologies] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);

  // When industry changes, refresh the recommended information categories.
  useEffect(() => {
    setSelectedCategories(recommendCategories(formData.industry));
  }, [formData.industry]);

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
            "capabilities": selectedCategories,
            "informationCategories": selectedCategories
              .map((id) => {
                const c = INFO_CATEGORIES.find((x) => x.id === id);
                return (
                  c && {
                    id: c.id,
                    name: c.name,
                    group: c.group,
                    direction: c.direction,
                    portability: !!c.portability,
                    sensitive: !!c.sensitive,
                    rightType: c.rightType,
                    basis: c.basis,
                    standards: vocabFor(c.rightType),
                  }
                );
              })
              .filter(Boolean),
            "ontologyMappings": selectedOntologies
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Organization Set-up</h1>
      <p className="text-slate-400 mb-8">Define your organization type and the information you are obliged to make available to people.</p>

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

        {/* Right Column: Classification */}
        <div className="flex-1 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-white mb-2 border-b border-white/10 pb-2">Classification</h2>

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

          <div className="mt-2 glass-input p-4 rounded-lg">
            <p className="text-sm text-slate-300">
              Your industry determines which{" "}
              <span className="text-[#d4af37] font-medium">information &amp; data categories</span> you are obliged
              to make available to people.
            </p>
            <p className="text-xs text-slate-500 mt-2 italic">
              Changing it refreshes the recommended set below. Review and tailor them, and switch the
              AU / Multi-jurisdiction / Standards view to see the legal basis.
            </p>
          </div>
        </div>
      </form>

      {/* Full-width: expansive information & data categories taxonomy. */}
      <div className="mt-8">
        <InformationCategories
          industry={formData.industry}
          selected={selectedCategories}
          setSelected={setSelectedCategories}
        />
      </div>

      {/* Platform Ontology Registry now lives in its own top-level tab. */}
      <div className="mt-8 glass-panel p-6 rounded-xl shadow-lg flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Platform Integrations & Data Portability</h2>
          <p className="text-sm text-slate-400 max-w-2xl">
            The Ontology Mapping Registry has moved to its own workspace. Browse the platform directory,
            pull down SHACL/RDF mappings, and request your own data back — as an organisation or a natural person.
          </p>
        </div>
        <Link to="/data-portability" className="action-btn px-6 py-3 shrink-0 text-center whitespace-nowrap">
          Open Registry →
        </Link>
      </div>

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
          <p className="text-sm text-slate-400">Your organization taxonomy and information-provision obligations have been written to the databox ledger.</p>
        </div>
      )}
    </div>
  );
};
