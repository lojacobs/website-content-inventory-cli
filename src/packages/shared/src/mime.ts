/**
 * MIME-type detection for inventory URLs.
 *
 * Detection is URL-extension only — no crawler change, no inventory-schema change.
 */

/** Extension (lowercase, with leading dot) → canonical MIME type. */
export const EXT_TO_MIME: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
};

/** Extensions that are treated as HTML (not binary). */
const HTML_EXTS = new Set(['.html', '.htm', '.php', '.aspx']);

export interface AssetInfo {
  /** True when the URL pathname ends in a recognized binary extension. */
  isBinary: boolean;
  /** Canonical MIME type when `isBinary` is true. */
  mimeType?: string;
  /** Lower-case extension including the leading dot when `isBinary` is true. */
  extension?: string;
}

/**
 * Inspect a URL's pathname to decide whether it points to a binary asset
 * (PDF, image, video, audio, Office document, archive, CSV, plain text).
 *
 * URLs whose pathname ends in `.html`, `.htm`, `.php`, `.aspx`, or has no
 * recognized extension → `isBinary = false` (treated as HTML).
 */
export function isBinaryAsset(url: string): AssetInfo {
  try {
    const { pathname } = new URL(url);
    const lastSlash = pathname.lastIndexOf('/');
    const filename = pathname.slice(lastSlash + 1);
    const dotIndex = filename.lastIndexOf('.');

    if (dotIndex <= 0) {
      // No extension or hidden file (".foo") — treat as HTML
      return { isBinary: false };
    }

    const ext = filename.slice(dotIndex).toLowerCase();

    if (HTML_EXTS.has(ext)) {
      return { isBinary: false };
    }

    const mimeType = EXT_TO_MIME[ext];
    if (mimeType) {
      return { isBinary: true, mimeType, extension: ext };
    }

    // Unknown extension — treat as HTML (conservative default)
    return { isBinary: false };
  } catch {
    // Invalid URL — treat as HTML (conservative default)
    return { isBinary: false };
  }
}
