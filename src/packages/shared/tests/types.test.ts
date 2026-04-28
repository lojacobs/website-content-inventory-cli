import { describe, it, expect } from 'vitest';
import { INVENTORY_COLUMNS, type SummarizeConfig, type InventoryRow } from '../src/index.js';

describe('shared types', () => {
  it('SummarizeConfig has the four spec fields', () => {
    const cfg: SummarizeConfig = {
      inventoryPath: '/tmp/_inventory.csv',
      aiProvider: 'opencode-go',
      aiModelId: 'minimax-m2.5',
      resume: true,
    };
    expect(cfg.inventoryPath).toBe('/tmp/_inventory.csv');
    expect(cfg.aiProvider).toBe('opencode-go');
    expect(cfg.aiModelId).toBe('minimax-m2.5');
    expect(cfg.resume).toBe(true);
  });

  it('SummarizeConfig.resume is optional', () => {
    const cfg: SummarizeConfig = {
      inventoryPath: '/tmp/_inventory.csv',
      aiProvider: 'opencode-go',
      aiModelId: 'minimax-m2.5',
    };
    expect(cfg.resume).toBeUndefined();
  });

  it('INVENTORY_COLUMNS includes error_message after ai_status', () => {
    const idxAi = INVENTORY_COLUMNS.indexOf('ai_status');
    const idxErr = INVENTORY_COLUMNS.indexOf('error_message');
    expect(idxErr).toBeGreaterThan(-1);
    expect(idxErr).toBe(idxAi + 1);
  });

  it('InventoryRow accepts error_message', () => {
    const row: InventoryRow = {
      URL: 'https://x.test/',
      Titre: '',
      Description: '',
      Resume_200_chars: '',
      Type_de_page: '',
      Profondeur_URL: 0,
      Nb_mots: 0,
      Statut_HTTP: 200,
      Langue: 'fr',
      Date_modifiee: '',
      Canonical: '',
      Noindex: 'no',
      Nb_images: 0,
      'Fichiers_liés': 0,
      Lien_Google_Doc: '',
      Lien_dossier_Drive: '',
      error_message: 'boom',
    };
    expect(row.error_message).toBe('boom');
  });
});