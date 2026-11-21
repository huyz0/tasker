import { Code, ConnectError } from '@connectrpc/connect';
import type { ListSavedViewsResponse } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
export type Audience = 'personal' | 'organization';
interface ReadReceipt { generation: number; epoch: number; sequence: number; }
/** Dialog-local receipts: old metadata cannot restore a known-denied authority. */
export class SavedViewAccess {
  generation = 0;
  denied = false;
  private epoch = 0;
  private sequence = 0;
  private recovering = false;
  private accepted = new Set<Audience>();
  private adminDeniedAt = 0;
  private adminAllowedAt = 0;
  get canEditShared() { return !this.denied && this.adminAllowedAt > this.adminDeniedAt; }
  begin(generation: number): ReadReceipt {
    if (generation !== this.generation) throw new Error('This saved-view read is no longer current.');
    return { generation, epoch: this.epoch, sequence: ++this.sequence };
  }
  private current(receipt: ReadReceipt) { return receipt.generation === this.generation && receipt.epoch === this.epoch; }
  accept(response: ListSavedViewsResponse, audience: Audience, receipt: ReadReceipt) {
    if (!this.current(receipt)) throw new Error('Saved-view access changed. Refresh the lists to check again.');
    const sharedRows = audience === 'organization' && response.views.length > 0;
    if (response.canCreateShared === false || (sharedRows && response.views.some(view => !view.canEdit))) this.denyShared();
    else if (response.canCreateShared === true || (sharedRows && response.views.every(view => view.canEdit))) {
      if (receipt.sequence > this.adminDeniedAt) this.adminAllowedAt = Math.max(this.adminAllowedAt, receipt.sequence);
    }
    if (this.recovering) {
      this.accepted.add(audience);
      if (this.accepted.size === 2) { this.denied = false;this.recovering = false; }
    }
  }
  fail(cause: unknown, receipt: ReadReceipt, aborted: boolean) {
    if (aborted || !this.current(receipt)) return;
    const code = ConnectError.from(cause).code;
    if (code === Code.PermissionDenied || code === Code.Unauthenticated) {
      this.denied = true;this.epoch++;this.recovering = false;this.accepted.clear();this.denyShared();
    }
  }
  /** A refusal invalidates every administrative read already in flight. */
  denyShared() { this.adminDeniedAt = this.sequence;this.adminAllowedAt = 0; }
  freshSharedHint(response: ListSavedViewsResponse & { receipt: ReadReceipt }) {
    return this.current(response.receipt) && response.receipt.sequence > this.adminDeniedAt && response.canCreateShared === true;
  }
  retry() {
    this.generation++;this.epoch++;this.recovering = this.denied;this.accepted.clear();
  }
}
