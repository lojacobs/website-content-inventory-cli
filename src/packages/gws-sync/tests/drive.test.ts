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
  uploadAsSheet,
  updateSheet,
} from '../src/drive.js';

const execaMock = execa as ReturnType<typeof vi.fn>;

beforeEach(() => {
  execaMock.mockReset();
});

// ---------------------------------------------------------------------------
// ensureDriveFolder
// ---------------------------------------------------------------------------

describe('ensureDriveFolder', () => {
  it('returns the existing folder id when one is found', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify([
        {
          id: 'folder-123',
          name: 'Test',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['parent-1'],
        },
      ]),
      stderr: '',
    });

    const result = await ensureDriveFolder('Test', 'parent-1');

    expect(result).toBe('folder-123');
    expect(execaMock).toHaveBeenCalledWith(
      'gws',
      expect.arrayContaining(['drive', 'files', 'list'])
    );
    expect(execaMock).toHaveBeenCalledTimes(1);
  });

  it('creates a new folder when the list call returns empty', async () => {
    // First call: list returns empty → trigger create.
    execaMock.mockResolvedValueOnce({ exitCode: 0, stdout: '[]', stderr: '' });
    // Second call: create succeeds.
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
    expect(execaMock).toHaveBeenNthCalledWith(
      2,
      'gws',
      expect.arrayContaining(['drive', 'files', 'create'])
    );
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
// uploadAsDoc
// ---------------------------------------------------------------------------

describe('uploadAsDoc', () => {
  it('uploads a .txt file as a Google Doc and returns the file id', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'doc-456',
        name: 'page.txt',
        mimeType: 'application/vnd.google-apps.document',
        parents: ['folder-1'],
      }),
      stderr: '',
    });

    const result = await uploadAsDoc('/path/to/page.txt', 'folder-1');

    expect(result).toBe('doc-456');
    expect(execaMock).toHaveBeenCalledWith(
      'gws',
      expect.arrayContaining([
        'drive', 'files', 'create',
        '--upload', 'page.txt',
        '--upload-content-type', 'text/plain',
      ]),
      expect.objectContaining({ cwd: '/path/to' }),
    );
    expect(execaMock).toHaveBeenCalledTimes(1);
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
  it('uploads a .csv file as a Google Sheet', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'sheet-789',
        name: 'data.csv',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['folder-1'],
      }),
      stderr: '',
    });

    const result = await uploadAsSheet('/path/to/data.csv', 'folder-1');

    expect(result).toBe('sheet-789');
    expect(execaMock).toHaveBeenCalledWith(
      'gws',
      expect.arrayContaining([
        'drive', 'files', 'create',
        '--upload', 'data.csv',
        '--upload-content-type', 'text/csv',
      ]),
      expect.objectContaining({ cwd: '/path/to' }),
    );
    expect(execaMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// updateSheet
// ---------------------------------------------------------------------------

describe('updateSheet', () => {
  it('calls gws drive files update with the correct args', async () => {
    execaMock.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await updateSheet('/path/to/data.csv', 'sheet-789');

    expect(execaMock).toHaveBeenCalledWith(
      'gws',
      expect.arrayContaining([
        'drive', 'files', 'update', 'sheet-789',
        '--upload', 'data.csv',
        '--upload-content-type', 'text/csv',
      ]),
      expect.objectContaining({ cwd: '/path/to' }),
    );
    expect(execaMock).toHaveBeenCalledTimes(1);
  });

  it('throws an error when the update fails', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'update failed',
    });

    await expect(
      updateSheet('/path/to/data.csv', 'sheet-789')
    ).rejects.toThrow('update failed');
  });
});