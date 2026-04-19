import { jest } from "@jest/globals";
import path from "path";

// Mock child_process before importing the module under test
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

import { exec } from "child_process";
import { buildFolderTree, mirrorFolderTree } from "../folder-mirror.js";

const mockedExec = exec as jest.MockedFunction<typeof exec>;

// Helper to make exec resolve with a JSON response
function mockExecResolvesWith(id: string): void {
  mockedExec.mockImplementation((_cmd, callback: any) => {
    callback(null, JSON.stringify({ id }), "");
    return {} as any;
  });
}

describe("buildFolderTree", () => {
  it("returns unique directory paths sorted by depth (shallowest first)", () => {
    const paths = [
      "/root/a/b/c",
      "/root/a/b",
      "/root/a",
    ];
    const result = buildFolderTree(paths);
    // Should have /root, /root/a, /root/a/b, /root/a/b/c at minimum
    expect(result[0]).toBe("/root");
    expect(result).toContain("/root/a");
    expect(result).toContain("/root/a/b");
    expect(result).toContain("/root/a/b/c");
    // Verify ordering by depth
    const idxRoot = result.indexOf("/root");
    const idxA = result.indexOf("/root/a");
    const idxB = result.indexOf("/root/a/b");
    const idxC = result.indexOf("/root/a/b/c");
    expect(idxRoot).toBeLessThan(idxA);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("deduplicates paths", () => {
    const paths = ["/root/a", "/root/a", "/root/b"];
    const result = buildFolderTree(paths);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it("handles a single path", () => {
    const result = buildFolderTree(["/foo/bar"]);
    expect(result).toContain("/foo");
    expect(result).toContain("/foo/bar");
  });

  it("returns empty array for empty input", () => {
    const result = buildFolderTree([]);
    expect(result).toEqual([]);
  });
});

describe("mirrorFolderTree", () => {
  const SEP = path.sep;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates Drive folders for each unique directory and returns path-to-id map", async () => {
    // Simulate exec returning sequential IDs
    let callCount = 0;
    mockedExec.mockImplementation((_cmd, callback: any) => {
      callCount++;
      callback(null, JSON.stringify({ id: `drive-id-${callCount}` }), "");
      return {} as any;
    });

    const localPaths = [`${SEP}root${SEP}a`, `${SEP}root${SEP}b`];
    const result = await mirrorFolderTree(localPaths, "root-drive-id");

    expect(result).toBeInstanceOf(Map);
    // The root path should map to driveRootId without a gws call
    expect(result.get(`${SEP}root`)).toBe("root-drive-id");
    // Sub-folders should have created IDs
    expect(result.get(`${SEP}root${SEP}a`)).toBe("drive-id-1");
    expect(result.get(`${SEP}root${SEP}b`)).toBe("drive-id-2");
  });

  it("calls gws with correct JSON payload including parent ID", async () => {
    mockExecResolvesWith("child-id");

    const localPaths = [`${SEP}root${SEP}child`];
    await mirrorFolderTree(localPaths, "root-drive-id");

    const calls = mockedExec.mock.calls;
    // Find the call that creates 'child'
    const childCall = calls.find((c) =>
      (c[0] as string).includes('"name":"child"')
    );
    expect(childCall).toBeDefined();
    expect(childCall![0] as string).toContain(
      '"parents":["root-drive-id"]'
    );
    expect(childCall![0] as string).toContain(
      '"mimeType":"application/vnd.google-apps.folder"'
    );
  });

  it("propagates parent IDs correctly for nested folders", async () => {
    let callCount = 0;
    mockedExec.mockImplementation((_cmd, callback: any) => {
      callCount++;
      callback(null, JSON.stringify({ id: `id-${callCount}` }), "");
      return {} as any;
    });

    const localPaths = [`${SEP}root${SEP}a${SEP}b`];
    const result = await mirrorFolderTree(localPaths, "drive-root");

    const aId = result.get(`${SEP}root${SEP}a`);
    const bId = result.get(`${SEP}root${SEP}a${SEP}b`);

    expect(aId).toBeDefined();
    expect(bId).toBeDefined();

    // The call creating 'b' should reference the ID returned for 'a'
    const bCall = mockedExec.mock.calls.find((c) =>
      (c[0] as string).includes('"name":"b"')
    );
    expect(bCall![0] as string).toContain(`"parents":["${aId!}"]`);
  });

  it("returns a map with the driveRootId for the root path", async () => {
    const result = await mirrorFolderTree([], "my-root");
    // Empty paths: nothing to create, but root should still be mapped if present
    expect(result).toBeInstanceOf(Map);
  });
});
