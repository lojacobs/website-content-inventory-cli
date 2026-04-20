import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCb);

/**
 * Upload a CSV file as a Google Sheets spreadsheet.
 *
 * @param csvPath      Absolute path to the CSV file to upload.
 * @param sheetName    Name to give the resulting spreadsheet.
 * @param parentFolderId Google Drive folder ID to place the sheet in.
 * @returns            URL of the created spreadsheet (https://docs.google.com/spreadsheets/d/{id}/edit).
 */
export async function uploadAsSheet(
  csvPath: string,
  sheetName: string,
  parentFolderId: string
): Promise<string> {
  const meta = JSON.stringify({
    name: sheetName,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [parentFolderId],
  });

  const cmd = [
    "gws drive files create",
    `--upload ${csvPath}`,
    `--upload-content-type text/csv`,
    `--json '${meta}'`,
  ].join(" \\\n  ");

  const { stdout } = await exec(cmd);

  // gws outputs JSON; parse for the file id
  const result = JSON.parse(stdout.trim()) as { id?: string };
  if (!result.id) {
    throw new Error(`gws did not return a file id. stdout: ${stdout}`);
  }

  return `https://docs.google.com/spreadsheets/d/${result.id}/edit`;
}

/**
 * Overwrite the content of an existing Google Sheets spreadsheet by
 * re-uploading a CSV.  The sheet retains its current ID.
 *
 * @param sheetId  Google Drive file ID of the existing spreadsheet.
 * @param csvPath  Absolute path to the CSV file with new content.
 */
export async function updateSheet(
  sheetId: string,
  csvPath: string
): Promise<void> {
  const params = JSON.stringify({ fileId: sheetId });
  const cmd = [
    `gws drive files update`,
    `--params '${params}'`,
    `--upload ${csvPath}`,
    `--upload-content-type text/csv`,
  ].join(" \\\n  ");

  await exec(cmd);
}
