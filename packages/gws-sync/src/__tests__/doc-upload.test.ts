import { jest } from "@jest/globals";

// Mock child_process before importing the module under test
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

import { exec } from "child_process";
import { uploadAsDoc, updateDoc } from "../doc-upload.js";

const mockExec = exec as jest.MockedFunction<typeof exec>;

function mockExecSuccess(stdout: string): void {
  mockExec.mockImplementation((_cmd: unknown, callback: unknown) => {
    (callback as (err: null, result: { stdout: string; stderr: string }) => void)(
      null,
      { stdout, stderr: "" }
    );
    return {} as ReturnType<typeof exec>;
  });
}

function mockExecError(message: string): void {
  mockExec.mockImplementation((_cmd: unknown, callback: unknown) => {
    (callback as (err: Error) => void)(new Error(message));
    return {} as ReturnType<typeof exec>;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("uploadAsDoc", () => {
  it("returns a GDoc URL from the id in the gws JSON response", async () => {
    mockExecSuccess(JSON.stringify({ id: "abc123xyz" }));

    const url = await uploadAsDoc(
      "/tmp/article.txt",
      "My Article",
      "folder-parent-id"
    );

    expect(url).toBe("https://docs.google.com/document/d/abc123xyz/edit");
  });

  it("invokes gws with correct flags for upload and mimeType conversion", async () => {
    mockExecSuccess(JSON.stringify({ id: "doc-id-456" }));

    await uploadAsDoc("/tmp/article.txt", "My Article", "parent-folder");

    expect(mockExec).toHaveBeenCalledTimes(1);
    const calledCmd = mockExec.mock.calls[0][0] as string;
    expect(calledCmd).toContain("gws drive files create");
    expect(calledCmd).toContain("--upload /tmp/article.txt");
    expect(calledCmd).toContain("--upload-content-type text/plain");
    expect(calledCmd).toContain("application/vnd.google-apps.document");
    expect(calledCmd).toContain("parent-folder");
    expect(calledCmd).toContain("My Article");
  });

  it("throws when gws command fails", async () => {
    mockExecError("gws: authentication error");

    await expect(
      uploadAsDoc("/tmp/article.txt", "Doc", "folder-id")
    ).rejects.toThrow("gws: authentication error");
  });

  it("throws when gws returns malformed JSON", async () => {
    mockExecSuccess("not-json");

    await expect(
      uploadAsDoc("/tmp/article.txt", "Doc", "folder-id")
    ).rejects.toThrow();
  });
});

describe("updateDoc", () => {
  it("calls gws drive files update with the doc id and local path", async () => {
    mockExecSuccess("");

    await updateDoc("existing-doc-id", "/tmp/updated.txt");

    expect(mockExec).toHaveBeenCalledTimes(1);
    const calledCmd = mockExec.mock.calls[0][0] as string;
    expect(calledCmd).toContain("gws drive files update existing-doc-id");
    expect(calledCmd).toContain("--upload /tmp/updated.txt");
    expect(calledCmd).toContain("--upload-content-type text/plain");
  });

  it("throws when the update command fails", async () => {
    mockExecError("gws: file not found");

    await expect(updateDoc("doc-id", "/tmp/file.txt")).rejects.toThrow(
      "gws: file not found"
    );
  });
});
