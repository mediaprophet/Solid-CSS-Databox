import type { HttpRequest } from '../../server/HttpRequest';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';
import { AsyncHandler } from '../../util/handlers/AsyncHandler';
import type { DataboxRequestContext } from './DataboxRequestContext';

/**
 * Builds the immutable {@link DataboxRequestContext} (component C3, DBX-04 §2) from a verified
 * request. This is the seam that captures the assurance/audience/delegation claims CSS never
 * extracts (DBX-01 §2, seam `CredentialsExtractor`). Concrete construction is DBX-12.
 */
export abstract class AuthenticatedContextExtractor extends AsyncHandler<HttpRequest, DataboxRequestContext> {}

/**
 * Fail-closed placeholder for {@link AuthenticatedContextExtractor}.
 *
 * The real extractor is built by DBX-12. Until then this stub refuses to fabricate a context:
 * it throws {@link NotImplementedHttpError} rather than returning an empty/optimistic context that
 * a downstream authorizer might misread as "authenticated". It never asserts any claim, so it can
 * never widen access (global preamble: no placeholder may silently permit access).
 */
export class NotImplementedContextExtractor extends AuthenticatedContextExtractor {
  public async handle(): Promise<DataboxRequestContext> {
    throw new NotImplementedHttpError('Databox authenticated-context extractor (C3) is not implemented (DBX-12).');
  }
}
