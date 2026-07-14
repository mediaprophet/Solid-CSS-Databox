import { DATABOX_GATEWAY_CODES } from '../../../../src/databox/gateway/GatewayReasonCodes';
import {
  DEFAULT_RDF_SHAPE_LIMITS,
  isRdfMediaType,
  validateRdfShape,
} from '../../../../src/databox/gateway/RdfShapeValidator';
import type { RdfShapeConfig } from '../../../../src/databox/gateway/RdfShapeValidator';
import { APPLICATION_LD_JSON, APPLICATION_OCTET_STREAM, TEXT_TURTLE } from '../../../../src/util/ContentTypes';

const config: RdfShapeConfig = {
  pinnedContexts: [ 'https://w3id.org/pinned/v1' ],
  limits: { maxNodes: 50, maxDepth: 8 },
};

function json(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

describe('validateRdfShape (bounded, pinned-context RDF/JSON gate, T-21)', (): void => {
  it('exports sane default limits.', (): void => {
    expect(DEFAULT_RDF_SHAPE_LIMITS.maxNodes).toBeGreaterThan(0);
    expect(DEFAULT_RDF_SHAPE_LIMITS.maxDepth).toBeGreaterThan(0);
  });

  it('accepts well-formed JSON with no @context.', (): void => {
    expect(validateRdfShape(json({ a: 1, b: [ 2, 3 ]}), APPLICATION_LD_JSON, config)).toBeUndefined();
  });

  it('accepts a pinned string @context and a pinned @context array.', (): void => {
    expect(validateRdfShape(json({ '@context': 'https://w3id.org/pinned/v1' }), APPLICATION_LD_JSON, config))
      .toBeUndefined();
    expect(validateRdfShape(json({ '@context': [ 'https://w3id.org/pinned/v1' ]}), APPLICATION_LD_JSON, config))
      .toBeUndefined();
  });

  it('accepts an inline object @context (offline).', (): void => {
    const body = json({ '@context': { name: 'https://w3id.org/pinned/v1#name' }, name: 'x' });
    expect(validateRdfShape(body, APPLICATION_LD_JSON, config)).toBeUndefined();
  });

  it('rejects a remote absolute-IRI @context.', (): void => {
    const rejection = validateRdfShape(json({ '@context': 'https://evil.example/ctx' }), APPLICATION_LD_JSON, config);
    expect(rejection?.code).toBe(DATABOX_GATEWAY_CODES.remoteContext);
  });

  it('rejects a non-pinned relative-string @context (fail closed).', (): void => {
    const rejection = validateRdfShape(json({ '@context': 'local-ctx' }), APPLICATION_LD_JSON, config);
    expect(rejection?.code).toBe(DATABOX_GATEWAY_CODES.remoteContext);
  });

  it('rejects unparsable JSON.', (): void => {
    const rejection = validateRdfShape(Buffer.from('{not json', 'utf8'), APPLICATION_LD_JSON, config);
    expect(rejection?.code).toBe(DATABOX_GATEWAY_CODES.malformedPayload);
  });

  it('rejects a payload exceeding the node budget (expansion bomb).', (): void => {
    const tiny: RdfShapeConfig = { pinnedContexts: [], limits: { maxNodes: 2, maxDepth: 100 }};
    const rejection = validateRdfShape(json({ a: 1, b: 2, c: 3, d: 4 }), APPLICATION_LD_JSON, tiny);
    expect(rejection?.code).toBe(DATABOX_GATEWAY_CODES.malformedPayload);
  });

  it('rejects a payload exceeding the depth budget (deep nesting).', (): void => {
    const shallow: RdfShapeConfig = { pinnedContexts: [], limits: { maxNodes: 1000, maxDepth: 2 }};
    const rejection = validateRdfShape(json({ a: { b: { c: { d: 1 }}}}), APPLICATION_LD_JSON, shallow);
    expect(rejection?.code).toBe(DATABOX_GATEWAY_CODES.malformedPayload);
  });

  it('accepts a bounded Turtle payload.', (): void => {
    expect(validateRdfShape(Buffer.from('<a> <b> <c> .', 'utf8'), TEXT_TURTLE, config)).toBeUndefined();
  });

  it('rejects a Turtle payload with a remote import (owl:imports or @import).', (): void => {
    expect(validateRdfShape(Buffer.from('<a> owl:imports <http://x> .', 'utf8'), TEXT_TURTLE, config)?.code)
      .toBe(DATABOX_GATEWAY_CODES.remoteContext);
    expect(validateRdfShape(Buffer.from('@import <http://x> .', 'utf8'), TEXT_TURTLE, config)?.code)
      .toBe(DATABOX_GATEWAY_CODES.remoteContext);
  });

  it('rejects a Turtle payload exceeding the node budget.', (): void => {
    const tiny: RdfShapeConfig = { pinnedContexts: [], limits: { maxNodes: 2, maxDepth: 8 }};
    const rejection = validateRdfShape(Buffer.from('a b c d e', 'utf8'), TEXT_TURTLE, tiny);
    expect(rejection?.code).toBe(DATABOX_GATEWAY_CODES.malformedPayload);
  });

  it('returns undefined for a non-RDF media type (routing is the caller\'s job).', (): void => {
    expect(validateRdfShape(Buffer.from('bytes', 'utf8'), APPLICATION_OCTET_STREAM, config)).toBeUndefined();
  });

  it('classifies RDF vs binary media types.', (): void => {
    expect(isRdfMediaType(APPLICATION_LD_JSON)).toBe(true);
    expect(isRdfMediaType(TEXT_TURTLE)).toBe(true);
    expect(isRdfMediaType(APPLICATION_OCTET_STREAM)).toBe(false);
  });
});
