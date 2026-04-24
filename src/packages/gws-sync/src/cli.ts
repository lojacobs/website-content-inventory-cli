import { Command } from 'commander';
import { sync } from './sync.js';
import type { SyncConfig } from './types.js';

const program = new Command();

program
  .name('fci-sync')
  .description('Sync inventory to Google Drive')
  .requiredOption('--inventory <path>', 'Path to inventory CSV file')
  .requiredOption('--folder-id <driveId>', 'Google Drive folder ID')
  .option('--no-resume', 'Disable resume mode (re-syncs all rows)');

program.action(async (options) => {
  const config: SyncConfig = {
    inventoryPath: options.inventory,
    driveFolderId: options.folderId,
    resume: options.resume,
  };

  try {
    await sync(config);
    process.exit(0);
  } catch (err) {
    console.error((err as Error).message ?? err);
    process.exit(1);
  }
});

program.parse(process.argv);