import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';

// Mock execa at module level — hoisted above imports by Vitest.
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Import after vi.mock so the mock is already registered.
import {
  ensureDriveFolder,
  uploadAsDoc,
  uploadAsBinary,
  uploadAsSheet,
  updateSheet,
  SheetNotFoundError,
  escapeDriveQuery,
} from '../src/drive.js';

const execaMock = execa as ReturnType<typeof vi.fn>;

beforeEach(() => {
  execaMock.mockReset();
});

// ---------------------------------------------------------------------------
// escapeDriveQuery
// ---------------------------------------------------------------------------

describe('escapeDriveQuery', () => {
  it('escapes single quotes', () => {
    expect(escapeDriveQuery("O'Brien")).toBe("O\\'Brien");
  });

  it('escapes backslashes before quotes', () => {
    expect(escapeDriveQuery('a\\b')).toBe('a\\\\b');
    expect(escapeDriveQuery("a\\'b")).toBe("a\\\\\\'b");
  });

  it('passes plain strings through unchanged', () => {
    expect(escapeDriveQuery('plain')).toBe('plain');
  });
});

// ---------------------------------------------------------------------------
// ensureDriveFolder
// ---------------------------------------------------------------------------

describe('ensureDriveFolder', () => {
  it('returns the existing folder id when one is found', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        files: [
          {
            id: 'folder-123',
            name: 'Test',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['parent-1'],
          },
        ],
      }),
      stderr: '',
    });

    const result = await ensureDriveFolder('Test', 'parent-1');

    expect(result).toBe('folder-123');
    expect(execaMock).toHaveBeenCalledTimes(1);

    const args = execaMock.mock.calls[0][1] as string[];
    expect(args.slice(0, 3)).toEqual(['drive', 'files', 'list']);

    // Verify --params payload contains the correct q clauses (parent + name + trashed).
    const paramsIdx = args.indexOf('--params');
    expect(paramsIdx).toBeGreaterThan(-1);
    const params = JSON.parse(args[paramsIdx + 1]) as { q: string };
    expect(params.q).toContain("name='Test'");
    expect(params.q).toContain("'parent-1' in parents");
    expect(params.q).toContain('trashed=false');
    expect(params.q).toContain("mimeType='application/vnd.google-apps.folder'");
  });

  it('creates a new folder when the list call returns an empty files array', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({ files: [] }),
      stderr: '',
    });
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'folder-new',
        name: 'New',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent-1'],
      }),
      stderr: '',
    });

    const result = await ensureDriveFolder('New', 'parent-1');

    expect(result).toBe('folder-new');
    expect(execaMock).toHaveBeenCalledTimes(2);

    const createArgs = execaMock.mock.calls[1][1] as string[];
    expect(createArgs.slice(0, 3)).toEqual(['drive', 'files', 'create']);
    const jsonIdx = createArgs.indexOf('--json');
    expect(jsonIdx).toBeGreaterThan(-1);
    const body = JSON.parse(createArgs[jsonIdx + 1]) as { name: string; parents: string[] };
    expect(body.name).toBe('New');
    expect(body.parents).toEqual(['parent-1']);
  });

  it('treats a response with no files key as "not found" and creates', async () => {
    // Drive sometimes omits the `files` key entirely when there are none.
    execaMock.mockResolvedValueOnce({ exitCode: 0, stdout: '{}', stderr: '' });
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'folder-new',
        name: 'New',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent-1'],
      }),
      stderr: '',
    });

    const result = await ensureDriveFolder('New', 'parent-1');
    expect(result).toBe('folder-new');
    expect(execaMock).toHaveBeenCalledTimes(2);
  });

  it('escapes single quotes in folder names (query-injection safety)', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({ files: [] }),
      stderr: '',
    });
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'folder-x',
        name: "O'Brien",
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent-1'],
      }),
      stderr: '',
    });

    await ensureDriveFolder("O'Brien", 'parent-1');

    const args = execaMock.mock.calls[0][1] as string[];
    const paramsIdx = args.indexOf('--params');
    const params = JSON.parse(args[paramsIdx + 1]) as { q: string };
    expect(params.q).toContain("name='O\\'Brien'");
  });

  it('throws an error when the list call fails', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'gws error',
    });

    await expect(ensureDriveFolder('Test', 'parent-1')).rejects.toThrow(
      'gws error'
    );
  });
});

// ---------------------------------------------------------------------------
// uploadAsBinary
// ---------------------------------------------------------------------------

describe('uploadAsBinary', () => {
  it('uploads a file with its original MIME type (no Workspace conversion)', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'file-999',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        parents: ['folder-1'],
      }),
      stderr: '',
    });

    const result = await uploadAsBinary(
      '/tmp/fci-sync-abc/report.pdf',
      'folder-1',
      'application/pdf',
      'report.pdf',
    );

    expect(result).toBe('file-999');

    const [, args, opts] = execaMock.mock.calls[0] as [string, string[], { cwd: string }];
    expect(args).toEqual(
      expect.arrayContaining([
        'drive', 'files', 'create',
        '--upload', 'report.pdf',
        '--upload-content-type', 'application/pdf',
      ]),
    );
    expect(opts.cwd).toBe('/tmp/fci-sync-abc');

    const jsonIdx = args.indexOf('--json');
    const body = JSON.parse(args[jsonIdx + 1]) as { name: string; mimeType: string };
    expect(body.name).toBe('report.pdf');
    expect(body.mimeType).toBe('application/pdf');
  });

  it('preserves the original filename including extension', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({ id: 'img-1', name: 'photo.jpg' }),
      stderr: '',
    });

    await uploadAsBinary(
      '/tmp/fci-sync-xyz/photo.jpg',
      'folder-2',
      'image/jpeg',
      'photo.jpg',
    );

    const [, args] = execaMock.mock.calls[0] as [string, string[]];
    const jsonIdx = args.indexOf('--json');
    const body = JSON.parse(args[jsonIdx + 1]) as { name: string };
    expect(body.name).toBe('photo.jpg');
  });

  it('throws an error when the upload fails', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'binary upload failed',
    });

    await expect(
      uploadAsBinary('/tmp/x.mp4', 'folder-1', 'video/mp4', 'x.mp4'),
    ).rejects.toThrow('binary upload failed');
  });
});

// ---------------------------------------------------------------------------
// uploadAsDoc
// ---------------------------------------------------------------------------

describe('uploadAsDoc', () => {
  it('uploads a .txt file as a Google Doc and strips the .txt extension from the title', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'doc-456',
        name: 'page',
        mimeType: 'application/vnd.google-apps.document',
        parents: ['folder-1'],
      }),
      stderr: '',
    });

    const result = await uploadAsDoc('/path/to/page.txt', 'folder-1');

    expect(result).toBe('doc-456');

    const [, args, opts] = execaMock.mock.calls[0] as [string, string[], { cwd: string }];
    expect(args).toEqual(
      expect.arrayContaining([
        'drive', 'files', 'create',
        '--upload', 'page.txt',
        '--upload-content-type', 'text/plain',
      ]),
    );
    expect(opts.cwd).toBe('/path/to');

    const jsonIdx = args.indexOf('--json');
    const body = JSON.parse(args[jsonIdx + 1]) as { name: string; mimeType: string };
    expect(body.name).toBe('page');
    expect(body.mimeType).toBe('application/vnd.google-apps.document');
  });

  it('throws an error when the upload fails', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'upload failed',
    });

    await expect(uploadAsDoc('/path/to/page.txt', 'folder-1')).rejects.toThrow(
      'upload failed'
    );
  });
});

// ---------------------------------------------------------------------------
// uploadAsSheet
// ---------------------------------------------------------------------------

describe('uploadAsSheet', () => {
  it('uploads a .csv file as a Google Sheet and strips the .csv extension', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'sheet-789',
        name: 'data',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['folder-1'],
      }),
      stderr: '',
    });

    const result = await uploadAsSheet('/path/to/data.csv', 'folder-1');

    expect(result).toBe('sheet-789');

    const [, args, opts] = execaMock.mock.calls[0] as [string, string[], { cwd: string }];
    expect(args).toEqual(
      expect.arrayContaining([
        'drive', 'files', 'create',
        '--upload', 'data.csv',
        '--upload-content-type', 'text/csv',
      ]),
    );
    expect(opts.cwd).toBe('/path/to');

    const jsonIdx = args.indexOf('--json');
    const body = JSON.parse(args[jsonIdx + 1]) as { name: string; mimeType: string };
    expect(body.name).toBe('data');
    expect(body.mimeType).toBe('application/vnd.google-apps.spreadsheet');
  });
});

// ---------------------------------------------------------------------------
// updateSheet
// ---------------------------------------------------------------------------

describe('updateSheet', () => {
  it('passes the sheet id via --params (fileId), not as a positional argument', async () => {
    execaMock.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await updateSheet('/path/to/data.csv', 'sheet-789');

    const [, args, opts] = execaMock.mock.calls[0] as [string, string[], { cwd: string }];

    // No positional sheet-id immediately after `update`.
    const updateIdx = args.indexOf('update');
    expect(args[updateIdx + 1]).toBe('--params');

    const paramsIdx = args.indexOf('--params');
    const params = JSON.parse(args[paramsIdx + 1]) as { fileId: string };
    expect(params.fileId).toBe('sheet-789');

    expect(args).toEqual(
      expect.arrayContaining([
        '--upload', 'data.csv',
        '--upload-content-type', 'text/csv',
      ]),
    );
    expect(opts.cwd).toBe('/path/to');
  });

  it('throws SheetNotFoundError when the API returns 404', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'HTTP 404: File not found',
    });

    await expect(
      updateSheet('/path/to/data.csv', 'sheet-789')
    ).rejects.toBeInstanceOf(SheetNotFoundError);
  });

  it('throws a plain Error for other failures', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'permission denied',
    });

    const promise = updateSheet('/path/to/data.csv', 'sheet-789');
    await expect(promise).rejects.toThrow('permission denied');
    await expect(promise).rejects.not.toBeInstanceOf(SheetNotFoundError);
  });
});
