import { exec } from "child_process";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Extracts unique directory paths from a list of local file/folder paths,
 * sorted by depth (shallowest first).
 */
export function buildFolderTree(localPaths: string[]): string[] {
  const dirs = new Set<string>();

  for (const p of localPaths) {
    // Treat each path as a directory (or get its parent if it looks like a file)
    // We collect the path itself and all its ancestors
    let current = p;
    while (current && current !== path.dirname(current)) {
      dirs.add(current);
      current = path.dirname(current);
    }
  }

  // Sort by depth (number of path segments), shallowest first
  return Array.from(dirs).sort((a, b) => {
    const depthA = a.split(path.sep).filter(Boolean).length;
    const depthB = b.split(path.sep).filter(Boolean).length;
    return depthA - depthB;
  });
}

/**
 * Creates each folder in Drive mirroring the local folder tree.
 * Returns a Map from local path to Google Drive folder ID.
 */
export async function mirrorFolderTree(
  localPaths: string[],
  driveRootId: string
): Promise<Map<string, string>> {
  const folderTree = buildFolderTree(localPaths);
  const pathToId = new Map<string, string>();

  // The root path is the common ancestor of all paths
  const rootPath = folderTree[0] ?? "";
  pathToId.set(rootPath, driveRootId);

  for (const folderPath of folderTree) {
    if (pathToId.has(folderPath)) {
      // Already mapped (e.g., root)
      continue;
    }

    const parentPath = path.dirname(folderPath);
    const parentId = pathToId.get(parentPath) ?? driveRootId;
    const folderName = path.basename(folderPath);

    const payload = JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    });

    const { stdout } = await execAsync(
      `gws drive files create --json '${payload}'`
    );

    const result = JSON.parse(stdout.trim()) as { id: string };
    pathToId.set(folderPath, result.id);
  }

  return pathToId;
}
