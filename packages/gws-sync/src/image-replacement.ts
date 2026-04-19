import { execSync } from "child_process";

export interface ImageMarker {
  alt: string;
  src: string;
  marker: string;
}

/**
 * Parses [IMAGE: alt | src] markers from text.
 * Returns an array of objects with alt, src, and the full marker string.
 */
export function parseImageMarkers(text: string): ImageMarker[] {
  const pattern = /\[IMAGE:\s*([^|]+?)\s*\|\s*([^\]]+?)\s*\]/g;
  const results: ImageMarker[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    results.push({
      alt: match[1],
      src: match[2],
      marker: match[0],
    });
  }

  return results;
}

/**
 * Replaces [IMAGE: alt | src] markers in a Google Doc with actual image insertions.
 * Uses gws docs replaceText to swap each marker with an inline image URI reference.
 *
 * Note: Google Docs API does not support direct image insertion via replaceText;
 * this function replaces the marker text with the src URL as a best-effort approach,
 * and logs each replacement for downstream tooling to handle full image embedding.
 */
export async function replaceImagesInDoc(
  docId: string,
  text: string
): Promise<void> {
  const markers = parseImageMarkers(text);

  for (const { marker, src, alt } of markers) {
    // Use gws docs to replace the marker text with the image src URL.
    // The marker is replaced inline; consumers can post-process to embed images.
    execSync(
      `gws docs +write --doc-id ${JSON.stringify(docId)} --find ${JSON.stringify(marker)} --replace ${JSON.stringify(src)}`,
      { stdio: "inherit" }
    );
  }
}
