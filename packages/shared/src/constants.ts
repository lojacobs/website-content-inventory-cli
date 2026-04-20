/**
 * CSV column constants matching the inventory header order
 */

import type { InventoryColumn } from './types.js';

/**
 * Ordered list of inventory CSV column names
 * Matches the exact header order used by the project
 */
export const INVENTORY_COLUMNS = [
  'URL',
  'Titre',
  'Description',
  'Resume_200_chars',
  'Type_de_page',
  'Profondeur_URL',
  'Nb_mots',
  'Statut_HTTP',
  'Langue',
  'Date_modifiee',
  'Canonical',
  'Noindex',
  'Nb_images',
  'Fichiers_liés',
  'Lien_Google_Doc',
  'Lien_dossier_Drive',
] as const;

export { type InventoryColumn };