import { APPLICATION_JSON, APPLICATION_LD_JSON, TEXT_N3, TEXT_TURTLE } from '../../util/ContentTypes';
import { DATABOX_GATEWAY_CODES, gatewayRejection } from './GatewayReasonCodes';
import type { GatewayRejection } from './GatewayReasonCodes';

/**
 * Bounded RDF/JSON-LD shape validation for the deposit/submission gateway (component C7; DBX-15;
 * CR-SRV-16; DBX-03 T-21). This is the malicious-RDF gate: it parses within a fixed resource budget with
 * **pinned/offline contexts only** and **never fetches remotely**, so a remote `@context`, an
 * entity-expansion bomb or a pathological nesting is rejected deterministically instead of hanging or
 * reaching out over the network.
 *
 * It validates *structure and safety*, not semantics — the ODRL/VC term-support checks live in DBX-07/
 * DBX-20. What it guarantees here (fail closed on each):
 * - **No remote context (T-21):** every `@context` string IRI must be in the pinned allow-list; any other
 *   absolute IRI (http/https/any scheme) is a remote-context rejection. Inline object contexts are fine.
 * - **Bounded parse (T-21/T-22):** JSON is parsed once (unparsable → malformed) and the resulting tree is
 *   walked with a hard node-count and depth budget; exceeding either is an expansion-bomb rejection.
 * - **Turtle/N3:** bounded by node budget over a lexical scan; a remote-import directive (`OWL:imports`
 *   style, or `@import`) is a remote-context rejection.
 *
 * The validator NEVER mutates the payload; it reads the bytes and returns a {@link GatewayRejection} or
 * `undefined` (shape is acceptable). Preserving the exact bytes is the caller's job.
 */

/** The resource budget for a bounded parse. Every field is a hard ceiling; exceeding it fails closed. */
export interface RdfShapeLimits {
  /** Maximum number of nodes (JSON values / Turtle tokens) examined before failing closed. */
  readonly maxNodes: number;
  /** Maximum nesting depth of the JSON tree before failing closed (entity-expansion guard). */
  readonly maxDepth: number;
}

/** Configuration for {@link validateRdfShape}: the pinned contexts and the resource budget. */
export interface RdfShapeConfig {
  /** The exact set of `@context` IRIs permitted (offline/pinned). Anything else is a remote context. */
  readonly pinnedContexts: readonly string[];
  readonly limits: RdfShapeLimits;
}

/** Safe default limits — generous for legitimate records, hostile to expansion bombs. */
export const DEFAULT_RDF_SHAPE_LIMITS: RdfShapeLimits = { maxNodes: 10_000, maxDepth: 32 };

/** The media types this validator treats as JSON-shaped (JSON-LD / plain JSON). */
const JSON_MEDIA_TYPES = new Set<string>([ APPLICATION_LD_JSON, APPLICATION_JSON ]);
/** The media types this validator treats as Turtle-family. */
const TURTLE_MEDIA_TYPES = new Set<string>([ TEXT_TURTLE, TEXT_N3 ]);

/** True when `value` is an absolute IRI (has a `scheme:` prefix), i.e. a candidate remote reference. */
function isAbsoluteIri(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/iu.test(value);
}

/**
 * Reject any `@context` reference that is not a pinned/offline context. A string context that is an
 * absolute IRI outside the allow-list is a remote context (T-21); a relative string that is not pinned is
 * also refused (fail closed — only explicitly pinned strings pass). Object contexts are inline/offline.
 */
function checkContextValue(value: unknown, pinned: Set<string>): GatewayRejection | undefined {
  if (typeof value === 'string') {
    if (pinned.has(value)) {
      return undefined;
    }
    if (isAbsoluteIri(value)) {
      return gatewayRejection(DATABOX_GATEWAY_CODES.remoteContext, 'Payload references a remote @context.');
    }
    return gatewayRejection(DATABOX_GATEWAY_CODES.remoteContext, 'Payload references a non-pinned @context.');
  }
  // Inline object contexts and other shapes are handled by the general tree walk; nothing to reject here.
  return undefined;
}

/**
 * Walk a parsed JSON tree within the node/depth budget, checking every `@context` against the pinned set.
 * Returns a rejection on the first violation (remote context or budget exceeded), else `undefined`.
 */
function walkJson(root: unknown, config: RdfShapeConfig): GatewayRejection | undefined {
  const pinned = new Set(config.pinnedContexts);
  const { maxNodes, maxDepth } = config.limits;
  let nodes = 0;
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];

  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    nodes += 1;
    if (nodes > maxNodes) {
      return gatewayRejection(DATABOX_GATEWAY_CODES.malformedPayload, 'Payload exceeds the node budget.');
    }
    if (depth > maxDepth) {
      return gatewayRejection(DATABOX_GATEWAY_CODES.malformedPayload, 'Payload exceeds the nesting budget.');
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        stack.push({ value: item, depth: depth + 1 });
      }
    } else if (value !== null && typeof value === 'object') {
      for (const [ key, nested ] of Object.entries(value as Record<string, unknown>)) {
        if (key === '@context') {
          const contexts = Array.isArray(nested) ? nested : [ nested ];
          for (const context of contexts) {
            const rejection = checkContextValue(context, pinned);
            if (rejection) {
              return rejection;
            }
          }
        }
        stack.push({ value: nested, depth: depth + 1 });
      }
    }
  }
  return undefined;
}

/** Validate a JSON / JSON-LD payload: parse once (bounded), then walk for pinned-context + budget. */
function validateJson(body: Buffer, config: RdfShapeConfig): GatewayRejection | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return gatewayRejection(DATABOX_GATEWAY_CODES.malformedPayload, 'Payload is not well-formed JSON.');
  }
  return walkJson(parsed, config);
}

/**
 * Validate a Turtle/N3 payload with a bounded lexical scan: reject a remote-import directive and enforce
 * the node (token) budget. This is the fail-closed bound; a production deployment plugs in a streaming
 * parser configured with no remote fetch behind the same contract.
 */
function validateTurtle(body: Buffer, config: RdfShapeConfig): GatewayRejection | undefined {
  const text = body.toString('utf8');
  if (/owl:imports|@import\b/iu.test(text)) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.remoteContext, 'Payload declares a remote import.');
  }
  const tokens = text.split(/\s+/u).filter((token): boolean => token.length > 0);
  if (tokens.length > config.limits.maxNodes) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.malformedPayload, 'Payload exceeds the node budget.');
  }
  return undefined;
}

/**
 * Bounded shape-validate an RDF/JSON payload for the given media type. Returns a non-leaking
 * {@link GatewayRejection} when the shape is unsafe/unparsable, or `undefined` when it is acceptable.
 * A media type this validator does not recognise as RDF/JSON returns `undefined` — the caller decides
 * (binary evidence is routed to quarantine, not here).
 */
export function validateRdfShape(
  body: Buffer,
  mediaType: string,
  config: RdfShapeConfig,
): GatewayRejection | undefined {
  if (JSON_MEDIA_TYPES.has(mediaType)) {
    return validateJson(body, config);
  }
  if (TURTLE_MEDIA_TYPES.has(mediaType)) {
    return validateTurtle(body, config);
  }
  return undefined;
}

/** Whether a media type is one this validator shape-checks (i.e. an RDF/JSON payload, not binary). */
export function isRdfMediaType(mediaType: string): boolean {
  return JSON_MEDIA_TYPES.has(mediaType) || TURTLE_MEDIA_TYPES.has(mediaType);
}
