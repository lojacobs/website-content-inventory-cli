import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Uploads a local TXT file to Google Drive as a Google Doc.
 * Uses gws drive files create with conversion to application/vnd.google-apps.document.
 *
 * @param localPath - Absolute path to the local .txt file
 * @param docName - Name for the resulting Google Doc
 * @param parentFolderId - Google Drive folder ID to place the doc in
 * @returns Full GDoc URL: https://docs.google.com/document/d/{id}/edit
 */
export async function uploadAsDoc(
  localPath: string,
  docName: string,
  parentFolderId: string
): Promise<string> {
  const payload = JSON.stringify({
    name: docName,
    mimeType: "application/vnd.google-apps.document",
    parents: [parentFolderId],
  });

  const command = [
    "gws drive files create",
    `--upload ${localPath}`,
    `--upload-content-type text/plain`,
    `--json '${payload}'`,
  ].join(" ");

  const { stdout } = await execAsync(command);
  const result = JSON.parse(stdout.trim()) as { id: string };

  return `https://docs.google.com/document/d/${result.id}/edit`;
}

/**
 * Updates the content of an existing Google Doc by re-uploading a local TXT file.
 * Uses gws drive files update to replace the file content in-place.
 *
 * @param docId - Google Drive file ID of the existing Google Doc
 * @param localPath - Absolute path to the local .txt file with new content
 */
export async function updateDoc(
  docId: string,
  localPath: string
): Promise<void> {
  const command = [
    `gws drive files update ${docId}`,
    `--upload ${localPath}`,
    `--upload-content-type text/plain`,
  ].join(" ");

  await execAsync(command);
}
