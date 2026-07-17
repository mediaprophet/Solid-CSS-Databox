// @ts-nocheck
//
// DEMO data provider — a fully in-memory, backend-free implementation used ONLY
// for the static GitHub Pages demo build (selected via VITE_DEMO in App.tsx).
//
// It never talks to the CSS Databox Forge. The live app keeps using the real
// `dataProvider.ts` (which posts to http://localhost:3000/.databox/forge); this
// file does not modify or import it. Everything here is synthetic sample data.

const SYNTHETIC_JWS =
  "eyJhbGciOiJFUzI1NiIsImtpZCI6ImRlbW8ja2V5LTEifQ." +
  "eyJpc3MiOiJodHRwczovL2RhdGFib3guZGVtby5leGFtcGxlL2lzc3VlciIsInN1YiI6InVybjp1dWlkOmRlbW8iLCJkZW1vIjp0cnVlfQ." +
  "SYNTHETIC-SIGNATURE-for-demo-only-not-a-real-signature";

// ── Seed: registered programs ───────────────────────────────────────────────
let mockPrograms = [
  {
    id: "prog-seraphim-welfare",
    profileId: "prog-seraphim-welfare",
    principalLegalName: "Seraphim Welfare Demonstrator (SYNTHETIC)",
    principalJurisdiction: "AU",
    programUri: "https://databox.demo.example/seraphim/program",
    databoxBaseUrl: "https://databox.demo.example/seraphim/boxes/",
    recordClasses: ["rc-case-note"],
    submissionClasses: [],
    recordClassBindings: [
      { id: "rc-case-note", label: "Case note", legalBasis: "lb-public-task", purposes: ["p-casework"] },
    ],
    legalComplianceClaimed: false,
  },
  {
    id: "prog-megamart-rewards-loyalty",
    profileId: "prog-megamart-rewards-loyalty",
    principalLegalName: "MegaMart Rewards Pty Ltd (SYNTHETIC)",
    principalJurisdiction: "AU",
    programUri: "https://databox.demo.example/megamart/program",
    databoxBaseUrl: "https://databox.demo.example/megamart/boxes/",
    recordClasses: ["rc-receipt", "rc-warranty", "rc-recall", "rc-rewards"],
    submissionClasses: ["sc-correction", "sc-warranty-claim", "sc-dietary-pref"],
    // Mirrors the loyalty profile's record-class → legal basis / purpose bindings.
    recordClassBindings: [
      { id: "rc-receipt", label: "Digital receipt", legalBasis: "lb-contract", purposes: ["p-account"] },
      { id: "rc-warranty", label: "Warranty record", legalBasis: "lb-contract", purposes: ["p-warranty"] },
      { id: "rc-recall", label: "Product recall notice", legalBasis: "lb-legal-obligation", purposes: ["p-safety"] },
      { id: "rc-rewards", label: "Rewards statement", legalBasis: "lb-contract", purposes: ["p-rewards"] },
    ],
    legalComplianceClaimed: false,
  },
];

// ── Seed: corrections / access-requests / consumer-ledger (mirrors the mocks
// already used by the live provider for these resources) ───────────────────
let mockCorrections = [
  { id: "req-1001", consumerUrn: "urn:uuid:1111-2222-3333-4444", targetRecord: "https://synthetic-corp.example/profiles/derived/ad_propensity", field: "derived:advertising_profile:income_bracket", currentValue: "$150k+", requestedCorrection: "$80k-$100k", status: "pending", submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(), dueDate: new Date(Date.now() + 8 * 86400000).toISOString(), dispositionReason: "" },
  { id: "req-1002", consumerUrn: "urn:uuid:5555-6666-7777-8888", targetRecord: "https://synthetic-corp.example/financial/ledger/tx-999", field: "financial:ledger:transaction_amount", currentValue: "50.00", requestedCorrection: "5.00", status: "more-information-required", submittedAt: new Date(Date.now() - 5 * 86400000).toISOString(), dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), dispositionReason: "Please provide a copy of the receipt." },
  { id: "req-1003", consumerUrn: "urn:uuid:9999-0000-1111-2222", targetRecord: "https://synthetic-corp.example/identity/core", field: "identity:core:legal_name", currentValue: "John Doe", requestedCorrection: "Jonathan Doe", status: "corrected", submittedAt: new Date(Date.now() - 15 * 86400000).toISOString(), dueDate: new Date(Date.now() - 5 * 86400000).toISOString(), dispositionReason: "Name updated successfully." },
];

let mockAccessRequests = [
  { id: "ar-2001", consumerUrn: "urn:uuid:1111-2222-3333-4444", scope: ["behavioral:location_history", "behavioral:search_history", "derived:advertising_profile", "social:graph_connections"], status: "pending", submittedAt: new Date(Date.now() - 3 * 86400000).toISOString(), dueDate: new Date(Date.now() + 7 * 86400000).toISOString(), regulatoryBasis: "CDR Rules Schedule 4, rule 7.22", dispositionReason: "" },
  { id: "ar-2002", consumerUrn: "urn:uuid:5555-6666-7777-8888", scope: ["identity:core", "financial:payment_instruments", "financial:transaction_ledger", "ugc:media_files"], status: "granted", submittedAt: new Date(Date.now() - 12 * 86400000).toISOString(), dueDate: new Date(Date.now() - 2 * 86400000).toISOString(), regulatoryBasis: "Privacy Act 1988, APP 12", dispositionReason: "Payload packaged and delivered via Databox broker." },
  { id: "ar-2003", consumerUrn: "urn:uuid:9999-0000-1111-2222", scope: ["health:biometrics:sleep_data", "health:biometrics:heart_rate"], status: "refused", submittedAt: new Date(Date.now() - 5 * 86400000).toISOString(), dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), regulatoryBasis: "Privacy Act 1988, APP 12", dispositionReason: "Exception 12.3(a) - Access would pose a serious threat to the life, health or safety of any individual." },
];

let mockLedger = [
  { id: "urn:uuid:1111-2222-3333-4444", consumerName: "Alice Smith", dataPoints: [{ field: "behavioral:location_history", value: "[124,532 GPS points retained]", source: "Mobile App Telemetry", policy: "Consent: Service Provision" }, { field: "derived:advertising_profile", value: "{ income: 'High', propensity_score: 0.84, segments: ['Tech', 'Travel'] }", source: "Algorithmic Inference Engine", policy: "Consent: Marketing" }, { field: "social:graph_connections", value: "[482 Edge connections]", source: "Social Feed", policy: "Consent: Service Provision" }], lastActive: new Date().toISOString() },
  { id: "urn:uuid:5555-6666-7777-8888", consumerName: "Bob Jones", dataPoints: [{ field: "financial:transaction_ledger", value: "[$14,203.44 lifetime spend across 42 orders]", source: "Payment Gateway", policy: "Legal Obligation (Tax Retention)" }, { field: "financial:payment_instruments", value: "[Tokenized Visa ending in 4422]", source: "Vault", policy: "Contractual Obligation" }], lastActive: new Date(Date.now() - 1 * 86400000).toISOString() },
];

let mockOutboundRequests = [
  { id: "obr-3001", platformId: "con-google", platformName: "Google", category: "Consumer", persona: "natural-person", requesterId: "urn:uuid:9999-0000-1111-2222", scope: ["behavioral:location_history", "behavioral:search_history", "identity:core"], regulatoryBasis: "GDPR Art. 20 (Data Portability)", status: "sent", submittedAt: new Date(Date.now() - 4 * 86400000).toISOString(), dueDate: new Date(Date.now() + 26 * 86400000).toISOString() },
  { id: "obr-3002", platformId: "ent-salesforce", platformName: "Salesforce", category: "Enterprise", persona: "organisation", requesterId: "urn:uuid:org-forge-0001", scope: ["identity:core", "financial:transaction_ledger"], regulatoryBasis: "CDR (Consumer Data Right)", status: "pending", submittedAt: new Date(Date.now() - 1 * 86400000).toISOString(), dueDate: new Date(Date.now() + 29 * 86400000).toISOString() },
];

const list = (data: unknown[]) => ({ data, total: data.length });

export const demoDataProvider = {
  getList: async ({ resource }: any) => {
    switch (resource) {
      case "programs": return list(mockPrograms);
      case "corrections": return list(mockCorrections);
      case "access-requests": return list(mockAccessRequests);
      case "consumer-ledger": return list(mockLedger);
      case "outbound-requests": return list(mockOutboundRequests);
      default: return list([]);
    }
  },

  getOne: async ({ resource, id }: any) => {
    const pick = (arr: any[]) => {
      const record = arr.find((r) => r.id === id);
      if (!record) throw new Error(`${resource} not found in demo data.`);
      return { data: record };
    };
    switch (resource) {
      case "corrections": return pick(mockCorrections);
      case "access-requests": return pick(mockAccessRequests);
      case "consumer-ledger": return pick(mockLedger);
      case "outbound-requests": return pick(mockOutboundRequests);
      default: throw new Error(`getOne not supported for '${resource}' in demo mode.`);
    }
  },

  create: async ({ resource, variables }: any) => {
    if (resource === "programs") {
      // Mirrors the Forge: the profile is the source of truth for id and principal.
      const profile = variables.profile ?? {};
      const profileId = profile.profileId || `prog-demo-${Date.now()}`;
      const principal = profile.program?.principal ?? {};
      const record = {
        id: profileId,
        profileId,
        profileVersion: profile.profileVersion || "1.0.0",
        principalLegalName: principal.legalName || "New Demo Program (SYNTHETIC)",
        principalJurisdiction: principal.jurisdiction || "AU",
        programUri: variables.programUri || `https://databox.demo.example/programs/${encodeURIComponent(profileId)}`,
        databoxBaseUrl: variables.databoxBaseUrl || "https://databox.demo.example/boxes/",
        recordClasses: (profile.recordClasses ?? []).map((r: any) => r.id ?? r),
        submissionClasses: (profile.submissionClasses ?? []).map((s: any) => s.id ?? s),
        recordClassBindings: (profile.recordClasses ?? []).map((r: any) => ({
          id: r.id ?? r,
          label: r.label ?? r.id ?? r,
          legalBasis: r.legalBasis ?? "",
          purposes: r.purposes ?? [],
        })),
        legalComplianceClaimed: false,
      };
      mockPrograms = [record, ...mockPrograms.filter((p) => p.profileId !== profileId)];
      return { data: record };
    }

    if (resource === "mappings") {
      const pairwiseWebId = variables.pairwiseWebId || "https://consumer-pod.example/profile/card#demo";
      const databox = "https://databox.demo.example/boxes/opaque-" + Math.random().toString(16).slice(2, 10) + "/";
      return {
        data: {
          provisioning: { relationship: { relationshipId: "rel-demo-" + Date.now() }, databox: { root: databox } },
          credential: {
            jws: SYNTHETIC_JWS,
            connectionId: "conn-demo-" + Date.now(),
            credential: {
              issuer: "https://databox.demo.example/issuer",
              credentialSubject: {
                id: pairwiseWebId,
                connection: {
                  program: "https://databox.demo.example/program",
                  databox,
                  storageDescription: `${databox}.well-known/solid`,
                  accessGrant: `${databox}access-grant`,
                  relationship: "rel-demo",
                },
              },
            },
          },
        },
      };
    }

    if (resource === "source-events" || resource === "events") {
      const acceptedResource = "https://databox.demo.example/boxes/opaque-demo/records/" + Math.random().toString(16).slice(2, 10);
      return {
        data: {
          status: "reconciled",
          reconciliation: { sourceEventId: variables.sourceEventId || "demo", acceptedResource },
          receipt: { jws: SYNTHETIC_JWS },
        },
      };
    }

    if (resource === "outbound-requests") {
      const now = Date.now();
      const record = { id: `obr-${now}`, status: "pending", ...variables, submittedAt: new Date(now).toISOString(), dueDate: new Date(now + 30 * 86400000).toISOString() };
      mockOutboundRequests = [record, ...mockOutboundRequests];
      return { data: record };
    }

    return { data: { id: Date.now(), ...variables } };
  },

  update: async ({ resource, id, variables }: any) => {
    const patch = (arr: any[]) => {
      const index = arr.findIndex((r) => r.id === id);
      if (index === -1) throw new Error(`${resource} not found in demo data.`);
      arr[index] = { ...arr[index], ...variables };
      return { data: arr[index] };
    };
    switch (resource) {
      case "corrections": return patch(mockCorrections);
      case "access-requests": return patch(mockAccessRequests);
      case "outbound-requests": return patch(mockOutboundRequests);
      default: throw new Error(`update not supported for '${resource}' in demo mode.`);
    }
  },

  deleteOne: async ({ id }: any) => ({ data: { id } }),

  getApiUrl: () => "demo://in-memory",
};
