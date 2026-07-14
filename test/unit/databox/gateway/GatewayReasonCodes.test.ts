import {
  DATABOX_GATEWAY_CODES,
  gatewayRejection,
  toGatewayHttpError,
} from '../../../../src/databox/gateway/GatewayReasonCodes';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { PayloadHttpError } from '../../../../src/util/errors/PayloadHttpError';
import { UnprocessableEntityHttpError } from '../../../../src/util/errors/UnprocessableEntityHttpError';
import { UnsupportedMediaTypeHttpError } from '../../../../src/util/errors/UnsupportedMediaTypeHttpError';

describe('GatewayReasonCodes', (): void => {
  it('every code carries the distinct gateway: segment (not the bare authz databox:*).', (): void => {
    for (const code of Object.values(DATABOX_GATEWAY_CODES)) {
      expect(code.startsWith('databox:gateway:')).toBe(true);
    }
  });

  it('gatewayRejection builds a {code, reason} value.', (): void => {
    const rejection = gatewayRejection(DATABOX_GATEWAY_CODES.unknownClass, 'nope');
    expect(rejection).toEqual({ code: DATABOX_GATEWAY_CODES.unknownClass, reason: 'nope' });
  });

  it('maps the size code to a 413 PayloadHttpError.', (): void => {
    const error = toGatewayHttpError(gatewayRejection(DATABOX_GATEWAY_CODES.payloadTooLarge, 'x'));
    expect(PayloadHttpError.isInstance(error)).toBe(true);
    expect(error.statusCode).toBe(413);
  });

  it('maps the media-type code to a 415 UnsupportedMediaTypeHttpError.', (): void => {
    const error = toGatewayHttpError(gatewayRejection(DATABOX_GATEWAY_CODES.unsupportedMediaType, 'x'));
    expect(UnsupportedMediaTypeHttpError.isInstance(error)).toBe(true);
    expect(error.statusCode).toBe(415);
  });

  it('maps the shape codes to a 422 UnprocessableEntityHttpError.', (): void => {
    const malformed = toGatewayHttpError(gatewayRejection(DATABOX_GATEWAY_CODES.malformedPayload, 'x'));
    const remote = toGatewayHttpError(gatewayRejection(DATABOX_GATEWAY_CODES.remoteContext, 'x'));
    expect(UnprocessableEntityHttpError.isInstance(malformed)).toBe(true);
    expect(UnprocessableEntityHttpError.isInstance(remote)).toBe(true);
    expect(malformed.statusCode).toBe(422);
  });

  it('maps every other (misaddressed/wrong-*) code to an identical non-leaking 400.', (): void => {
    const error = toGatewayHttpError(gatewayRejection(DATABOX_GATEWAY_CODES.relationshipMismatch, 'x'));
    expect(BadRequestHttpError.isInstance(error)).toBe(true);
    expect(error.statusCode).toBe(400);
    // The message carries only the abstract code, never payload content.
    expect(error.message).toContain(DATABOX_GATEWAY_CODES.relationshipMismatch);
  });
});
