import { buildDeliveryRequest } from '../../../../../../src/databox/cms/modules/delivery/DeliveryRequest';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildDeliveryRequest', (): void => {
  it('builds an ActivityStreams Offer for a delivery request.', (): void => {
    const request = buildDeliveryRequest({
      id: 'https://example.org/deliveries/1',
      order: 'https://example.org/orders/1',
      requestedBy: 'https://example.org/people/alice',
      pickup: '123 Market St',
      dropoff: '456 Elm St',
    });
    expect(request['@context']).toBe('https://www.w3.org/ns/activitystreams');
    expect(request['@type']).toBe('Offer');
    expect(request['@id']).toBe('https://example.org/deliveries/1');

    const actor = record(request.actor);
    expect(actor['@id']).toBe('https://example.org/people/alice');

    const object = record(request.object);
    expect(object['@id']).toBe('https://example.org/orders/1');

    expect(request.origin).toBe('123 Market St');
    expect(request.target).toBe('456 Elm St');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildDeliveryRequest({
      id: 'not-a-uri',
      order: 'https://example.org/orders/1',
      requestedBy: 'https://example.org/people/alice',
      pickup: '123 Market St',
      dropoff: '456 Elm St',
    })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI order.', (): void => {
    expect((): unknown => buildDeliveryRequest({
      id: 'https://example.org/deliveries/1',
      order: 'not-a-uri',
      requestedBy: 'https://example.org/people/alice',
      pickup: '123 Market St',
      dropoff: '456 Elm St',
    })).toThrow('order must be an absolute URI');
  });

  it('rejects a non-URI requestedBy.', (): void => {
    expect((): unknown => buildDeliveryRequest({
      id: 'https://example.org/deliveries/1',
      order: 'https://example.org/orders/1',
      requestedBy: 'not-a-uri',
      pickup: '123 Market St',
      dropoff: '456 Elm St',
    })).toThrow('requestedBy must be an absolute URI');
  });

  it('rejects an empty pickup location.', (): void => {
    expect((): unknown => buildDeliveryRequest({
      id: 'https://example.org/deliveries/1',
      order: 'https://example.org/orders/1',
      requestedBy: 'https://example.org/people/alice',
      pickup: ' ',
      dropoff: '456 Elm St',
    })).toThrow('pickup location');
  });

  it('rejects an empty dropoff location.', (): void => {
    expect((): unknown => buildDeliveryRequest({
      id: 'https://example.org/deliveries/1',
      order: 'https://example.org/orders/1',
      requestedBy: 'https://example.org/people/alice',
      pickup: '123 Market St',
      dropoff: ' ',
    })).toThrow('dropoff location');
  });
});
