import type { InventoryRow } from "@fci/shared";

/**
 * Public schema row for the inspiration CSV (Google Sheet).
 * Columns: URL, Titre, Description, Resume_200_chars, Type_de_page, Profondeur_URL, Nb_mots,
 *          Statut_HTTP, Langue, Date_modifiee, Canonical, Noindex, Nb_images, Fichiers_liés,
 *          Lien_Google_Doc, Lien_dossier_Drive
 */
export interface PublicSchemaRow {
  URL: string;
  Titre: string;
  Description: string;
  Resume_200_chars: string;
  Type_de_page: string;
  Profondeur_URL: string;
  Nb_mots: string;
  Statut_HTTP: string;
  Langue: string;
  Date_modifiee: string;
  Canonical: string;
  Noindex: string;
  Nb_images: string;
  Fichiers_liés: string;
  Lien_Google_Doc: string;
  Lien_dossier_Drive: string;
}

/**
 * Compute URL depth (number of path segments).
 * For example: "https://example.com/a/b/c" → 3
 */
function computeUrlDepth(urlString: string): number {
  try {
    const url = new URL(urlString);
    const pathSegments = url.pathname
      .split("/")
      .filter((seg) => seg.length > 0);
    return pathSegments.length;
  } catch {
    return 0;
  }
}

/**
 * Transform an internal InventoryRow to the public schema for Google Sheets.
 *
 * Field mappings:
 * - url → URL
 * - title (if available) → Titre
 * - page_type → Type_de_page
 * - word_count → Nb_mots
 * - summary (first 200 chars) → Resume_200_chars
 * - doc_id → Lien_Google_Doc (as full Google Docs URL)
 * - driveFolderLink (provided separately) → Lien_dossier_Drive
 * - Other columns (Description, Statut_HTTP, Langue, Date_modifiee, Canonical, Noindex, Nb_images, Fichiers_liés) → empty
 * - Profondeur_URL → computed from URL depth
 */
export function transformToPublicSchema(
  row: InventoryRow,
  driveFolderLink: string = ""
): PublicSchemaRow {
  const urlDepth = computeUrlDepth(row.url);

  // Convert summary to first 200 characters
  const resume200Chars = row.summary ? row.summary.substring(0, 200) : "";

  // Convert doc_id to full Google Docs URL
  const googleDocLink = row.doc_id
    ? `https://docs.google.com/document/d/${row.doc_id}`
    : "";

  return {
    URL: row.url || "",
    Titre: row.title || "",
    Description: "",
    Resume_200_chars: resume200Chars,
    Type_de_page: row.page_type || "",
    Profondeur_URL: String(urlDepth),
    Nb_mots: row.word_count ? String(row.word_count) : "",
    Statut_HTTP: "",
    Langue: "",
    Date_modifiee: "",
    Canonical: "",
    Noindex: "",
    Nb_images: "",
    Fichiers_liés: "",
    Lien_Google_Doc: googleDocLink,
    Lien_dossier_Drive: driveFolderLink,
  };
}

/**
 * Convert PublicSchemaRow to CSV line with proper escaping.
 */
export function publicRowToCSVLine(row: PublicSchemaRow): string {
  const headers: (keyof PublicSchemaRow)[] = [
    "URL",
    "Titre",
    "Description",
    "Resume_200_chars",
    "Type_de_page",
    "Profondeur_URL",
    "Nb_mots",
    "Statut_HTTP",
    "Langue",
    "Date_modifiee",
    "Canonical",
    "Noindex",
    "Nb_images",
    "Fichiers_liés",
    "Lien_Google_Doc",
    "Lien_dossier_Drive",
  ];

  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  return headers.map((h) => escape(row[h])).join(",");
}

/**
 * Convert an array of internal InventoryRows to the public schema CSV format.
 * Returns a CSV string with header and data rows.
 */
export function transformInventoryToPublicCSV(
  rows: InventoryRow[],
  driveFolderLinkMap: Map<string, string> = new Map()
): string {
  const headers = [
    "URL",
    "Titre",
    "Description",
    "Resume_200_chars",
    "Type_de_page",
    "Profondeur_URL",
    "Nb_mots",
    "Statut_HTTP",
    "Langue",
    "Date_modifiee",
    "Canonical",
    "Noindex",
    "Nb_images",
    "Fichiers_liés",
    "Lien_Google_Doc",
    "Lien_dossier_Drive",
  ];

  const publicRows = rows.map((row) => {
    const driveFolderLink = driveFolderLinkMap.get(row.url) || "";
    return transformToPublicSchema(row, driveFolderLink);
  });

  const csvLines = publicRows.map(publicRowToCSVLine);

  return [headers.join(","), ...csvLines].join("\n") + "\n";
}
