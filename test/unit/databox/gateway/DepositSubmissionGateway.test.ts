import { generateKeyPairSync } from 'node:crypto';
import { publicJwkFromKeyObject, sha256Hex, signCompactJws } from '../../../../src/databox/credential/Es256';
import {
  BinaryEvidenceQuarantine,
  StubVerdictScanner,
} from '../../../../src/databox/gateway/BinaryEvidenceQuarantine';
import { DepositSubmissionGateway } from '../../../../src/databox/gateway/DepositSubmissionGateway';
import type { GatewayBounds, GatewayContext } from '../../../../src/databox/gateway/DepositSubmissionGateway';
import { DATABOX_GATEWAY_CODES } from '../../../../src/databox/gateway/GatewayReasonCodes';
import { IdempotencyRegistry } from '../../../../src/databox/gateway/IdempotencyRegistry';
import type {
  DepositRequest,
  GatewayOutcome,
  InstitutionalSignatureClaim,
  NamespacedEventKey,
  SubmissionRequest,
} from '../../../../src/databox/gateway/GatewayTypes';
import type { InstitutionProfile } from '../../../../src/databox/profile/InstitutionProfile';
import type { TenantContext } from '../../../../src/databox/tenant/TenantContext';
import { APPLICATION_LD_JSON, APPLICATION_OCTET_STREAM, TEXT_HTML } from '../../../../src/util/ContentTypes';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const issuerJwk = publicJwkFromKeyObject(publicKey);

const BOX_ROOT = 'https://databox.example/boxes/bx1/';

const tenant = {
  organisation: 'org-1',
  program: 'prog-1',
  tenantId: 'org-1/prog-1',
  boxId: 'bx1',
  boxRoot: BOX_ROOT,
  relationshipId: 'rel-1',
} as unknown as TenantContext;

const profile = {
  recordClasses: [
    { id: 'rc-receipt', policyTemplate: 'pt-records', legalBasis: 'lb-contract', purposes: [ 'p-account' ]},
  ],
  submissionClasses: [
    { id: 'sc-correction', policyTemplate: 'pt-submissions', purposes: [ 'p-correction' ]},
  ],
  legalBases: [{ id: 'lb-contract', description: '' }],
  policies: {
    templates: [
      { id: 'pt-records', version: '1.0.0', odrlProfile: 'x' },
      { id: 'pt-submissions', version: '1.0.0', odrlProfile: 'x' },
    ],
  },
} as unknown as InstitutionProfile;

const bounds: GatewayBounds = {
  default: { maxBytes: 2000, allowedMediaTypes: [ APPLICATION_LD_JSON, APPLICATION_OCTET_STREAM ]},
  rdf: { pinnedContexts: [ 'https://w3id.org/pinned/v1' ], limits: { maxNodes: 100, maxDepth: 16 }},
};

const issuerKeys = [{ issuer: 'iss-1', publicKey: issuerJwk }];

function context(overrides: Partial<GatewayContext> = {}): GatewayContext {
  return { profile, tenant, bounds, issuerKeys, ...overrides };
}

function newGateway(): DepositSubmissionGateway {
  const idempotency = new IdempotencyRegistry({ secretFactory: (): Buffer => Buffer.alloc(32, 3) });
  const quarantine = new BinaryEvidenceQuarantine(new StubVerdictScanner((): boolean => false), {
    idFactory: (): string => 'qid-1',
    clock: (): string => '2026-07-15T00:00:00Z',
  });
  return new DepositSubmissionGateway(idempotency, quarantine);
}

const eventKey: NamespacedEventKey = {
  organisation: 'org-1',
  program: 'prog-1',
  sourceSystem: 'sor-pos',
  eventType: 'receipt',
  sourceEventId: 'urn:uuid:1',
};

function sign(body: Buffer, issuer = 'iss-1'): InstitutionalSignatureClaim {
  const jws = signCompactJws({ alg: 'ES256' }, { payloadDigest: `urn:sha256:${sha256Hex(body)}` }, privateKey);
  return { issuer, jws };
}

const rdfBody = Buffer.from(
  JSON.stringify({ '@context': 'https://w3id.org/pinned/v1', type: 'DigitalReceipt' }),
  'utf8',
);

function deposit(overrides: Partial<DepositRequest> = {}): DepositRequest {
  const body = overrides.body ?? rdfBody;
  return {
    operation: 'deposit',
    target: `${BOX_ROOT}records/rc-receipt/`,
    mediaType: APPLICATION_LD_JSON,
    body,
    recordClass: 'rc-receipt',
    legalBasis: 'lb-contract',
    purpose: 'p-account',
    policyRef: { policyTemplate: 'pt-records', policyVersion: '1.0.0' },
    addressedRelationshipId: 'rel-1',
    signature: sign(body),
    idempotency: eventKey,
    ...overrides,
  };
}

function submission(overrides: Partial<SubmissionRequest> = {}): SubmissionRequest {
  const body = overrides.body ?? Buffer.from(JSON.stringify({ correction: 'x' }), 'utf8');
  return {
    operation: 'submission',
    target: `${BOX_ROOT}submissions/sc-correction/`,
    mediaType: APPLICATION_LD_JSON,
    body,
    submissionClass: 'sc-correction',
    purpose: 'p-correction',
    policyRef: { policyTemplate: 'pt-submissions', policyVersion: '1.0.0' },
    addressedRelationshipId: 'rel-1',
    ...overrides,
  };
}

function expectRejected(outcome: GatewayOutcome, code: string): void {
  expect(outcome.status).toBe('rejected');
  const rejected = outcome as Extract<GatewayOutcome, { status: 'rejected' }>;
  expect(rejected.rejection.code).toBe(code);
}

function acceptanceOf(outcome: GatewayOutcome): Extract<GatewayOutcome, { status: 'accepted' }>['acceptance'] {
  return (outcome as Extract<GatewayOutcome, { status: 'accepted' }>).acceptance;
}

describe('DepositSubmissionGateway — deposit (org → consumer, T-21/22/23/24)', (): void => {
  it('accepts a fully valid RDF deposit and digests the exact bytes.', async(): Promise<void> => {
    const outcome = await newGateway().validate(deposit(), context());
    expect(outcome.status).toBe('accepted');
    const acceptance = acceptanceOf(outcome);
    expect(acceptance.payloadDigest).toBe(sha256Hex(rdfBody));
    expect(acceptance.container).toBe('records');
    expect(acceptance.idempotencyKey).toBeDefined();
  });

  it('returns the ORIGINAL outcome on a duplicate idempotency key (T-24).', async(): Promise<void> => {
    const gateway = newGateway();
    const first = await gateway.validateDeposit(deposit(), context());
    const second = await gateway.validateDeposit(deposit(), context());
    expect(second.status).toBe('duplicate');
    expect(acceptanceOf(second)).toEqual(acceptanceOf(first));
  });

  it('rejects a malformed namespaced idempotency tuple (fail closed).', async(): Promise<void> => {
    const req = deposit({ idempotency: { ...eventKey, sourceEventId: '' }});
    expectRejected(await newGateway().validateDeposit(req, context()), DATABOX_GATEWAY_CODES.idempotencyMalformed);
  });

  it('rejects a misaddressed relationship.', async(): Promise<void> => {
    const req = deposit({ addressedRelationshipId: 'rel-OTHER' });
    expectRejected(await newGateway().validateDeposit(req, context()), DATABOX_GATEWAY_CODES.relationshipMismatch);
  });

  it('rejects an undeclared record class (wrong-class).', async(): Promise<void> => {
    const req = deposit({ recordClass: 'rc-ghost' });
    expectRejected(await newGateway().validateDeposit(req, context()), DATABOX_GATEWAY_CODES.unknownClass);
  });

  it('rejects a target that is not the class records container.', async(): Promise<void> => {
    const req = deposit({ target: `${BOX_ROOT}records/rc-warranty/` });
    expectRejected(await newGateway().validateDeposit(req, context()), DATABOX_GATEWAY_CODES.containerMismatch);
  });

  it('rejects a purpose not permitted for the class (wrong-purpose).', async(): Promise<void> => {
    const req = deposit({ purpose: 'p-marketing' });
    expectRejected(await newGateway().validateDeposit(req, context()), DATABOX_GATEWAY_CODES.purposeNotPermitted);
  });

  it('rejects a wrong legal basis, and a class basis absent from the profile.', async(): Promise<void> => {
    const gateway = newGateway();
    expectRejected(
      await gateway.validateDeposit(deposit({ legalBasis: 'lb-other' }), context()),
      DATABOX_GATEWAY_CODES.legalBasisMismatch,
    );
    const badProfile = {
      ...profile,
      recordClasses: [{ ...profile.recordClasses[0], legalBasis: 'lb-missing' }],
      legalBases: [],
    } as unknown as InstitutionProfile;
    expectRejected(
      await gateway.validateDeposit(deposit({ legalBasis: 'lb-missing' }), context({ profile: badProfile })),
      DATABOX_GATEWAY_CODES.legalBasisMismatch,
    );
  });

  it('rejects an unresolved policy ref (wrong template, wrong version, missing template).', async(): Promise<void> => {
    const gateway = newGateway();
    expectRejected(
      await gateway.validateDeposit(
        deposit({ policyRef: { policyTemplate: 'pt-other', policyVersion: '1.0.0' }}),
        context(),
      ),
      DATABOX_GATEWAY_CODES.policyRefUnresolved,
    );
    expectRejected(
      await gateway.validateDeposit(
        deposit({ policyRef: { policyTemplate: 'pt-records', policyVersion: '9.9.9' }}),
        context(),
      ),
      DATABOX_GATEWAY_CODES.policyRefUnresolved,
    );
    const noTemplateProfile = {
      ...profile,
      recordClasses: [{ ...profile.recordClasses[0], policyTemplate: 'pt-ghost' }],
    } as unknown as InstitutionProfile;
    expectRejected(
      await gateway.validateDeposit(
        deposit({ policyRef: { policyTemplate: 'pt-ghost', policyVersion: '1.0.0' }}),
        context({ profile: noTemplateProfile }),
      ),
      DATABOX_GATEWAY_CODES.policyRefUnresolved,
    );
  });

  it('rejects a disallowed media type and an oversized payload.', async(): Promise<void> => {
    const gateway = newGateway();
    expectRejected(
      await gateway.validateDeposit(deposit({ mediaType: TEXT_HTML }), context()),
      DATABOX_GATEWAY_CODES.unsupportedMediaType,
    );
    const big = Buffer.alloc(3000, 1);
    expectRejected(
      await gateway.validateDeposit(
        deposit({ body: big, mediaType: APPLICATION_OCTET_STREAM, signature: sign(big) }),
        context(),
      ),
      DATABOX_GATEWAY_CODES.payloadTooLarge,
    );
  });

  it('honours a tighter per-class size bound.', async(): Promise<void> => {
    const perClassBounds: GatewayBounds = {
      ...bounds,
      perClass: { 'rc-receipt': { maxBytes: 5, allowedMediaTypes: [ APPLICATION_LD_JSON ]}},
    };
    expectRejected(
      await newGateway().validateDeposit(deposit(), context({ bounds: perClassBounds })),
      DATABOX_GATEWAY_CODES.payloadTooLarge,
    );
  });

  it('rejects an untrusted issuer, a bad signature, and a non-binding digest.', async(): Promise<void> => {
    const gateway = newGateway();
    expectRejected(
      await gateway.validateDeposit(deposit({ signature: sign(rdfBody, 'iss-UNKNOWN') }), context()),
      DATABOX_GATEWAY_CODES.issuerUntrusted,
    );
    expectRejected(
      await gateway.validateDeposit(deposit({ signature: { issuer: 'iss-1', jws: 'not.a.jws' }}), context()),
      DATABOX_GATEWAY_CODES.signatureInvalid,
    );
    const otherSig = sign(Buffer.from('different', 'utf8'));
    expectRejected(
      await gateway.validateDeposit(deposit({ signature: otherSig }), context()),
      DATABOX_GATEWAY_CODES.signatureInvalid,
    );
    const noDigestJws = signCompactJws({ alg: 'ES256' }, { foo: 'bar' }, privateKey);
    expectRejected(
      await gateway.validateDeposit(deposit({ signature: { issuer: 'iss-1', jws: noDigestJws }}), context()),
      DATABOX_GATEWAY_CODES.signatureInvalid,
    );
  });

  it('rejects an RDF deposit whose shape references a remote context (T-21).', async(): Promise<void> => {
    const body = Buffer.from(JSON.stringify({ '@context': 'https://evil.example/ctx' }), 'utf8');
    const outcome = await newGateway().validateDeposit(deposit({ body, signature: sign(body) }), context());
    expectRejected(outcome, DATABOX_GATEWAY_CODES.remoteContext);
  });

  it('routes a binary deposit into quarantine (bytes not servable, T-22).', async(): Promise<void> => {
    const body = Buffer.from('binary-evidence', 'utf8');
    const outcome = await newGateway().validateDeposit(
      deposit({ body, mediaType: APPLICATION_OCTET_STREAM, signature: sign(body) }),
      context(),
    );
    expect(outcome.status).toBe('quarantined');
    expect(acceptanceOf(outcome).quarantineId).toBe('qid-1');
  });
});

describe('DepositSubmissionGateway — submission (consumer → org)', (): void => {
  it('accepts a valid submission with no idempotency key.', async(): Promise<void> => {
    const outcome = await newGateway().validate(submission(), context());
    expect(outcome.status).toBe('accepted');
    expect(acceptanceOf(outcome).container).toBe('submissions');
    expect(acceptanceOf(outcome).idempotencyKey).toBeUndefined();
  });

  it('dedupes a submission that carries an idempotency key.', async(): Promise<void> => {
    const gateway = newGateway();
    const req = submission({ idempotency: { ...eventKey, eventType: 'correction' }});
    const first = await gateway.validateSubmission(req, context());
    const second = await gateway.validateSubmission(req, context());
    expect(first.status).toBe('accepted');
    expect(second.status).toBe('duplicate');
  });

  it('rejects a malformed idempotency tuple on a submission.', async(): Promise<void> => {
    const req = submission({ idempotency: { ...eventKey, organisation: '' }});
    expectRejected(await newGateway().validateSubmission(req, context()), DATABOX_GATEWAY_CODES.idempotencyMalformed);
  });

  it('rejects misaddressed / wrong-class / wrong-container / wrong-purpose / bad-policy / bounds.', async():
  Promise<void> => {
    const gateway = newGateway();
    expectRejected(
      await gateway.validateSubmission(submission({ addressedRelationshipId: 'rel-X' }), context()),
      DATABOX_GATEWAY_CODES.relationshipMismatch,
    );
    expectRejected(
      await gateway.validateSubmission(submission({ submissionClass: 'sc-ghost' }), context()),
      DATABOX_GATEWAY_CODES.unknownClass,
    );
    expectRejected(
      await gateway.validateSubmission(submission({ target: `${BOX_ROOT}submissions/sc-other/` }), context()),
      DATABOX_GATEWAY_CODES.containerMismatch,
    );
    expectRejected(
      await gateway.validateSubmission(submission({ purpose: 'p-nope' }), context()),
      DATABOX_GATEWAY_CODES.purposeNotPermitted,
    );
    expectRejected(
      await gateway.validateSubmission(
        submission({ policyRef: { policyTemplate: 'pt-wrong', policyVersion: '1.0.0' }}),
        context(),
      ),
      DATABOX_GATEWAY_CODES.policyRefUnresolved,
    );
    expectRejected(
      await gateway.validateSubmission(submission({ mediaType: TEXT_HTML }), context()),
      DATABOX_GATEWAY_CODES.unsupportedMediaType,
    );
  });

  it('rejects a submission with a remote-context shape (T-21).', async(): Promise<void> => {
    const body = Buffer.from(JSON.stringify({ '@context': 'https://evil.example/ctx' }), 'utf8');
    expectRejected(
      await newGateway().validateSubmission(submission({ body }), context()),
      DATABOX_GATEWAY_CODES.remoteContext,
    );
  });

  it('quarantines a binary submission, with and without an idempotency key.', async(): Promise<void> => {
    const gateway = newGateway();
    const body = Buffer.from('binary', 'utf8');
    const noKey = await gateway.validateSubmission(
      submission({ body, mediaType: APPLICATION_OCTET_STREAM }),
      context(),
    );
    expect(noKey.status).toBe('quarantined');

    const withKey = await gateway.validateSubmission(
      submission({ body, mediaType: APPLICATION_OCTET_STREAM, idempotency: { ...eventKey, eventType: 'bin' }}),
      context(),
    );
    expect(withKey.status).toBe('quarantined');
    expect(acceptanceOf(withKey).idempotencyKey).toBeDefined();
  });
});
