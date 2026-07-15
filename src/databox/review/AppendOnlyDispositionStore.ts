import { ConflictHttpError } from '../../util/errors/ConflictHttpError';
import type { SignedDisposition } from './ReviewTypes';

/**
 * The append-only disposition store (component C17, IF-13; ADR-0018 §append-only supersession). A disposition
 * is a NEW appended resource LINKED to its submission — never an in-place edit of the submission or of a
 * prior disposition. This enforces exactly the create-yes/replace-no contract of the storage
 * {@link ../storage/AppendOnlyStore} (reconciled with it — production layers these resources behind the real
 * append-only store; this is the governed-queue-local reference index over the same invariant):
 *
 * - **No overwrite.** Appending a `dispositionId` that already exists is refused (409) — a disposition, once
 *   appended, is immutable (T-45 §submitter identity + payload digest preserved; ADR-0018 §no in-place edit).
 * - **Linked, multi-disposition.** A submission may accrue MORE THAN ONE appended disposition (e.g. a
 *   `more-information-required` then a `corrected`); each is a distinct appended record and all remain
 *   retrievable in append order via {@link forSubmission}. History is never rewritten.
 * - **No system-of-record write.** This store only appends dispositions; it never touches the source of
 *   record (ADR-0016 — the source-of-record write is routed to a governed case AFTER an authorized
 *   disposition, never here).
 */
export class AppendOnlyDispositionStore {
  private readonly byId = new Map<string, SignedDisposition>();
  private readonly bySubmission = new Map<string, string[]>();

  /**
   * Append a signed disposition, linked to its submission. Fails closed (409) if the `dispositionId` was
   * already appended — an existing disposition is never overwritten in place (ADR-0018).
   */
  public append(signed: SignedDisposition): SignedDisposition {
    const { dispositionId, submissionRef } = signed.envelope;
    if (this.byId.has(dispositionId)) {
      throw new ConflictHttpError(`Append-only: disposition '${dispositionId}' already exists (no in-place edit).`);
    }
    this.byId.set(dispositionId, signed);
    const links = this.bySubmission.get(submissionRef) ?? [];
    links.push(dispositionId);
    this.bySubmission.set(submissionRef, links);
    return signed;
  }

  /** The appended disposition for `dispositionId`, or `undefined`. */
  public get(dispositionId: string): SignedDisposition | undefined {
    return this.byId.get(dispositionId);
  }

  /** Whether a disposition with `dispositionId` has been appended. */
  public has(dispositionId: string): boolean {
    return this.byId.has(dispositionId);
  }

  /** Every disposition appended against `submissionRef`, in append order (defensive copy). */
  public forSubmission(submissionRef: string): readonly SignedDisposition[] {
    const ids = this.bySubmission.get(submissionRef) ?? [];
    return ids.map((id): SignedDisposition => this.byId.get(id)!);
  }

  /** Every appended disposition (defensive copy). */
  public all(): readonly SignedDisposition[] {
    return [ ...this.byId.values() ];
  }
}
