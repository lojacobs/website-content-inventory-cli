import { parseImageMarkers, replaceImagesInDoc } from "../image-replacement.js";
import { execSync } from "child_process";

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe("parseImageMarkers", () => {
  it("returns empty array for text with no markers", () => {
    expect(parseImageMarkers("No images here.")).toEqual([]);
  });

  it("parses a single marker", () => {
    const text = "[IMAGE: A cat | https://example.com/cat.jpg]";
    const result = parseImageMarkers(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      alt: "A cat",
      src: "https://example.com/cat.jpg",
      marker: "[IMAGE: A cat | https://example.com/cat.jpg]",
    });
  });

  it("parses multiple markers", () => {
    const text =
      "[IMAGE: Dog | https://example.com/dog.png] and [IMAGE: Bird | https://example.com/bird.gif]";
    const result = parseImageMarkers(text);
    expect(result).toHaveLength(2);
    expect(result[0].alt).toBe("Dog");
    expect(result[0].src).toBe("https://example.com/dog.png");
    expect(result[1].alt).toBe("Bird");
    expect(result[1].src).toBe("https://example.com/bird.gif");
  });

  it("trims whitespace around alt and src", () => {
    const text = "[IMAGE:   Spaced Alt   |   https://example.com/img.jpg   ]";
    const result = parseImageMarkers(text);
    expect(result).toHaveLength(1);
    expect(result[0].alt).toBe("Spaced Alt");
    expect(result[0].src).toBe("https://example.com/img.jpg");
  });

  it("preserves the full marker string exactly", () => {
    const marker = "[IMAGE: Logo | https://cdn.example.com/logo.svg]";
    const result = parseImageMarkers(`Before ${marker} after`);
    expect(result[0].marker).toBe(marker);
  });

  it("ignores malformed markers missing the pipe separator", () => {
    expect(parseImageMarkers("[IMAGE: no pipe here]")).toEqual([]);
  });

  it("ignores malformed markers missing closing bracket", () => {
    expect(parseImageMarkers("[IMAGE: alt | src")).toEqual([]);
  });

  it("handles markers embedded in larger text", () => {
    const text =
      "Intro paragraph.\n\n[IMAGE: Screenshot | https://example.com/ss.png]\n\nBody text.";
    const result = parseImageMarkers(text);
    expect(result).toHaveLength(1);
    expect(result[0].alt).toBe("Screenshot");
  });

  it("handles alt text containing colons", () => {
    const text = "[IMAGE: Note: important image | https://example.com/x.jpg]";
    const result = parseImageMarkers(text);
    expect(result).toHaveLength(1);
    expect(result[0].alt).toBe("Note: important image");
  });

  it("returns correct marker strings for multiple markers", () => {
    const m1 = "[IMAGE: A | https://a.com/a.jpg]";
    const m2 = "[IMAGE: B | https://b.com/b.jpg]";
    const result = parseImageMarkers(`${m1} text ${m2}`);
    expect(result[0].marker).toBe(m1);
    expect(result[1].marker).toBe(m2);
  });
});

describe("replaceImagesInDoc", () => {
  beforeEach(() => {
    mockExecSync.mockClear();
  });

  it("calls execSync for each image marker found", async () => {
    const text =
      "[IMAGE: Cat | https://example.com/cat.jpg] [IMAGE: Dog | https://example.com/dog.jpg]";
    await replaceImagesInDoc("doc-123", text);
    expect(mockExecSync).toHaveBeenCalledTimes(2);
  });

  it("does not call execSync when text has no markers", async () => {
    await replaceImagesInDoc("doc-123", "Plain text, no images.");
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("passes docId and marker info to gws docs command", async () => {
    const text = "[IMAGE: Logo | https://cdn.example.com/logo.svg]";
    await replaceImagesInDoc("my-doc-id", text);
    expect(mockExecSync).toHaveBeenCalledTimes(1);
    const callArg = (mockExecSync.mock.calls[0][0] as string);
    expect(callArg).toContain("my-doc-id");
    expect(callArg).toContain("https://cdn.example.com/logo.svg");
  });

  it("resolves without error on success", async () => {
    await expect(
      replaceImagesInDoc("doc-abc", "[IMAGE: Test | https://example.com/t.jpg]")
    ).resolves.toBeUndefined();
  });
});
