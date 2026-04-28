/**
 * Local types for ai-summarizer.
 * SummarizeConfig is re-exported from @full-content-inventory/shared.
 */

/** Forwarded to every Pi SDK call. Both fields required (INV-02). */
export interface RunOptions {
  provider: string;
  modelId: string;
}

/** Shape of ~/.pi/agent/auth.json — read-only. Flat object keyed by provider name. */
export interface AuthJson {
  [provider: string]: unknown;
}