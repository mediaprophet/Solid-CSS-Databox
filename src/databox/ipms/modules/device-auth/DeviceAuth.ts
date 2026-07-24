import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * Input for device enrolment — a device claims an identity URI and
 * generates a keypair + client certificate for mTLS authentication.
 */
export interface DeviceEnrolmentInput {
  readonly id: string;
  readonly deviceName: string;
  readonly organisation: string;
  readonly deviceType: 'pos-terminal' | 'customer-display' | 'kitchen-display' | 'scanner' | 'printer' | 'other';
  readonly claimUri: string;
  readonly publicKeyPem: string;
  readonly enrolledAt: string;
}

export interface DeviceEnrolmentResult {
  readonly record: Record<string, unknown>;
  readonly deviceId: string;
  readonly status: 'pending' | 'enrolled' | 'revoked';
}

/**
 * Input for device authentication verification (WebID-TLS).
 */
export interface DeviceAuthInput {
  readonly deviceId: string;
  readonly certificateFingerprint: string;
  readonly presentedAt: string;
}

export interface DeviceAuthResult {
  readonly authenticated: boolean;
  readonly reason: string;
  readonly record: Record<string, unknown>;
}

/**
 * Input for device revocation.
 */
export interface DeviceRevocationInput {
  readonly deviceId: string;
  readonly revokedBy: string;
  readonly revokedAt: string;
  readonly reason: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A device ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A device ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A device ${field} must be a valid date.`);
  }
  return value;
}

function requireDeviceType(value: string): DeviceEnrolmentInput['deviceType'] {
  const valid = [ 'pos-terminal', 'customer-display', 'kitchen-display', 'scanner', 'printer', 'other' ] as const;
  if (!valid.includes(value as DeviceEnrolmentInput['deviceType'])) {
    throw new BadRequestHttpError(`Device type must be one of: ${valid.join(', ')}.`);
  }
  return value as DeviceEnrolmentInput['deviceType'];
}

/**
 * Enrol a device — creates a device identity record with the device's
 * public key for mTLS client certificate verification.
 *
 * The enrolment flow (P7-02):
 * 1. Device generates keypair locally
 * 2. Device sends public key + claim URI to this endpoint
 * 3. IPMS records the device identity with pending status
 * 4. Operator approves → status becomes enrolled
 * 5. Device uses client cert for mTLS on `devices.<apex>` hostname
 */
export function enrolDevice(input: DeviceEnrolmentInput): DeviceEnrolmentResult {
  const id = requireUri(input.id, 'id');
  const deviceName = requireNonEmpty(input.deviceName, 'deviceName');
  const organisation = requireUri(input.organisation, 'organisation');
  const deviceType = requireDeviceType(input.deviceType);
  const claimUri = requireUri(input.claimUri, 'claimUri');
  const publicKeyPem = requireNonEmpty(input.publicKeyPem, 'publicKeyPem');
  const enrolledAt = requireDate(input.enrolledAt, 'enrolledAt');

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://www.w3.org/ns/solid/v1' ],
    [LD_TYPE]: [ 'Device', 'SolidDevice' ],
    [LD_ID]: id,
    name: deviceName,
    manufacturer: { [LD_ID]: organisation },
    deviceType,
    'solid:claim': claimUri,
    publicKey: publicKeyPem,
    dateCreated: enrolledAt,
    enrollmentStatus: 'pending',
  };

  return { record, deviceId: id, status: 'pending' };
}

/**
 * Verify a device's authentication attempt by checking the certificate
 * fingerprint against the enrolled device record.
 */
export function verifyDeviceAuth(
  enrolled: DeviceEnrolmentResult,
  input: DeviceAuthInput,
): DeviceAuthResult {
  const deviceId = requireUri(input.deviceId, 'deviceId');
  const fingerprint = requireNonEmpty(input.certificateFingerprint, 'certificateFingerprint');
  const presentedAt = requireDate(input.presentedAt, 'presentedAt');

  if (deviceId !== enrolled.deviceId) {
    return {
      authenticated: false,
      reason: 'Device ID does not match enrolled device.',
      record: { [LD_TYPE]: 'AuthenticationFailure', reason: 'device-id-mismatch' },
    };
  }

  if (enrolled.status === 'revoked') {
    return {
      authenticated: false,
      reason: 'Device has been revoked.',
      record: { [LD_TYPE]: 'AuthenticationFailure', reason: 'device-revoked' },
    };
  }

  if (enrolled.status === 'pending') {
    return {
      authenticated: false,
      reason: 'Device enrolment is pending approval.',
      record: { [LD_TYPE]: 'AuthenticationFailure', reason: 'enrolment-pending' },
    };
  }

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Authentication',
    [LD_ID]: `${deviceId}#auth-${Date.now()}`,
    agent: { [LD_ID]: deviceId },
    actionStatus: 'CompletedActionStatus',
    startTime: presentedAt,
    certificateFingerprint: fingerprint,
  };

  return {
    authenticated: true,
    reason: 'Device authenticated via mTLS.',
    record,
  };
}

/**
 * Revoke a device's identity — removes mTLS access.
 */
export function revokeDevice(input: DeviceRevocationInput): Record<string, unknown> {
  const deviceId = requireUri(input.deviceId, 'deviceId');
  const revokedBy = requireUri(input.revokedBy, 'revokedBy');
  const revokedAt = requireDate(input.revokedAt, 'revokedAt');
  const reason = requireNonEmpty(input.reason, 'reason');

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Action', 'RevokeAction' ],
    [LD_ID]: `${deviceId}#revoke-${Date.now()}`,
    object: { [LD_ID]: deviceId },
    agent: { [LD_ID]: revokedBy },
    actionStatus: 'CompletedActionStatus',
    result: reason,
    endTime: revokedAt,
  };
}
