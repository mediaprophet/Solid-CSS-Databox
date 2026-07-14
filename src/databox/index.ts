// Databox extension scaffold (DBX-09). Interfaces/types and fail-closed stubs for the accepted
// Databox-owned server-side components from the DBX-04 reference architecture. See
// databox/handoffs/DBX-09.md. No stub here silently permits access or claims conformance.

// Context (C3)
export * from './context/AuthenticatedContextExtractor';
export * from './context/DataboxRequestContext';

// Tenant (C5)
export * from './tenant/TenantResolver';

// Authorization (C4)
export * from './authorization/DataboxAuthorizer';

// Storage (C6)
export * from './storage/AppendOnlyStore';

// Identifiers (C10)
export * from './identifiers/OpaqueIdentifierGenerator';

// Evidence & receipts (C13/C19)
export * from './evidence/Evidence';

// Cursor feed (C15)
export * from './feed/CursorFeed';
