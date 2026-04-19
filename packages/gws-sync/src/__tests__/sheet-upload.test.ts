/**
 * Tests for sheet-upload.ts
 *
 * Strategy: mock the `exec` helper at the module level using jest.unstable_mockModule
 * so the ESM import of the module under test picks up the mock.
 */

import { jest } from "@jest/globals";

const mockExecFn = jest.fn<() => Promise<{ stdout: string; stderr: string }>>();

jest.unstable_mockModule("node:child_process", () => ({
  exec: jest.fn(),
}));

jest.unstable_mockModule("node:util", () => ({
  promisify: () => mockExecFn,
}));

const { uploadAsSheet, updateSheet } = await import("../sheet-upload.js");

beforeEach(() => mockExecFn.mockReset());

describe("uploadAsSheet", () => {
  it("returns a spreadsheet URL with the file id from gws output", async () => {
    mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: "abc123" }), stderr: "" });

    const url = await uploadAsSheet("/tmp/data.csv", "My Sheet", "folder-xyz");

    expect(url).toBe("https://docs.google.com/spreadsheets/d/abc123/edit");
  });

  it("includes mimeType, parent, name, and csv path in the gws command", async () => {
    mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: "id1" }), stderr: "" });

    await uploadAsSheet("/tmp/data.csv", "My Sheet", "folder-xyz");

    const cmd = mockExecFn.mock.calls[0]![0] as string;
    expect(cmd).toContain("application/vnd.google-apps.spreadsheet");
    expect(cmd).toContain("folder-xyz");
    expect(cmd).toContain("My Sheet");
    expect(cmd).toContain("text/csv");
    expect(cmd).toContain("/tmp/data.csv");
  });

  it("throws when gws output has no id field", async () => {
    mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ kind: "drive#file" }), stderr: "" });

    await expect(
      uploadAsSheet("/tmp/data.csv", "My Sheet", "folder-xyz")
    ).rejects.toThrow("gws did not return a file id");
  });

  it("propagates exec errors", async () => {
    mockExecFn.mockRejectedValue(new Error("gws auth failed"));

    await expect(
      uploadAsSheet("/tmp/data.csv", "My Sheet", "folder-xyz")
    ).rejects.toThrow("gws auth failed");
  });
});

describe("updateSheet", () => {
  it("calls gws drive files update with the sheet id and csv path", async () => {
    mockExecFn.mockResolvedValue({ stdout: "", stderr: "" });

    await updateSheet("sheet-999", "/tmp/updated.csv");

    const cmd = mockExecFn.mock.calls[0]![0] as string;
    expect(cmd).toContain("gws drive files update sheet-999");
    expect(cmd).toContain("/tmp/updated.csv");
    expect(cmd).toContain("text/csv");
  });

  it("propagates exec errors", async () => {
    mockExecFn.mockRejectedValue(new Error("network error"));

    await expect(updateSheet("sheet-999", "/tmp/updated.csv")).rejects.toThrow(
      "network error"
    );
  });
});
