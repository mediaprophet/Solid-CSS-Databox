// Databox extension scaffold (DBX-09). Interfaces/types and fail-closed stubs for the accepted
// Databox-owned server-side components from the DBX-04 reference architecture. See
// databox/handoffs/DBX-09.md. No stub here silently permits access or claims conformance.

// Context (C3)
export * from './context/AuthenticatedContextExtractor';
export * from './context/DataboxRequestContext';
export * from './context/AssuranceCrosswalk';

// Tenant (C5)
export * from './tenant/TenantResolver';

// Authorization (C4)
export * from './authorization/DataboxAuthorizer';

// Storage (C6)
export * from './storage/AppendOnlyStore';

// Identifiers (C10)
export * from './identifiers/OpaqueIdentifierGenerator';

// Provisioning & relationship mapping (C10/C11, DBX-10)
export * from './provisioning/ProvisioningTypes';
export * from './provisioning/RelationshipMappingRegistry';
export * from './provisioning/DataboxProvisioner';

// Evidence & receipts (C13/C19)
export * from './evidence/Evidence';

// Cursor feed (C15)
export * from './feed/CursorFeed';

// Institution/program profile schema (C10/C11 provisioning inputs, DBX-06)
export * from './profile/InstitutionProfile';
export * from './profile/InstitutionProfileSchema';
export * from './profile/InstitutionProfileValidator';

// ODRL vocabulary & profile (C12, DBX-07)
export * from './odrl/terms';
export * from './odrl/TermSupport';

// ODRL evaluator & obligation engine (C12, DBX-20)
export * from './policy/PolicyEngine';

// Deposit/submission gateway (C7, DBX-15)
export * from './gateway/DepositSubmissionGateway';

// Verifiable record proof validation (C7/C16, DBX-16)
export * from './proof/RecordProofValidator';

// Signed acceptance receipts (C7/C13, DBX-18)
export * from './receipt/AcceptanceReceiptSigner';

// Connection credential lifecycle (C7/C9/C16, DBX-13)
export * from './credential/BitstringStatusList';
export * from './credential/ConnectionCredentialIssuer';
export * from './credential/ConnectionCredentialRegistry';
export * from './credential/ConnectionCredentialTypes';
export * from './credential/ConnectionCredentialValidator';
export * from './credential/Es256';
export * from './credential/HolderKeyProof';
export * from './credential/ProvisionalTokenExchange';
