import { EventEmitter } from 'events';
import { Readable } from 'stream';

// ── Mock child_process.spawn before importing the module under test ──────────
const mockChildProcess = {
  stderr: new Readable({ read() {} }) as NodeJS.ReadableStream & EventEmitter,
  on: jest.fn(),
};

jest.mock('child_process', () => ({
  spawn: jest.fn(() => mockChildProcess),
}));

import { spawn } from 'child_process';
import {
  DANGEROUS_EXTENSIONS,
  isDangerousUrl,
  buildWgetArgs,
  downloadPage,
} from '../downloader.js';

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Helper: reset the mock child process for each test
function makeChild(stderrData: string, exitCode = 0) {
  const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const child = new EventEmitter() as ReturnType<typeof spawn>;
  (child as unknown as { stderr: EventEmitter }).stderr = stderr;

  // Emit stderr data then process close asynchronously
  setImmediate(() => {
    stderr.emit('data', Buffer.from(stderrData));
    child.emit('close', exitCode);
  });

  return child;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── DANGEROUS_EXTENSIONS ─────────────────────────────────────────────────────

describe('DANGEROUS_EXTENSIONS', () => {
  it('includes exe, dmg, sh, bat, cmd, msi, pkg, deb, rpm, ps1, vbs, js, jar, app', () => {
    const expected = ['exe', 'dmg', 'sh', 'bat', 'cmd', 'msi', 'pkg', 'deb', 'rpm', 'ps1', 'vbs', 'js', 'jar', 'app'];
    for (const ext of expected) {
      expect(DANGEROUS_EXTENSIONS).toContain(ext);
    }
  });
});

// ── isDangerousUrl ───────────────────────────────────────────────────────────

describe('isDangerousUrl', () => {
  it('returns true for .exe URL', () => {
    expect(isDangerousUrl('https://example.com/setup.exe')).toBe(true);
  });

  it('returns true for .dmg URL', () => {
    expect(isDangerousUrl('https://example.com/app.dmg')).toBe(true);
  });

  it('returns true for .sh URL', () => {
    expect(isDangerousUrl('https://example.com/install.sh')).toBe(true);
  });

  it('returns false for .html URL', () => {
    expect(isDangerousUrl('https://example.com/index.html')).toBe(false);
  });

  it('returns false for .htm URL', () => {
    expect(isDangerousUrl('https://example.com/page.htm')).toBe(false);
  });

  it('returns false for URL with no extension', () => {
    expect(isDangerousUrl('https://example.com/about')).toBe(false);
  });

  it('returns false for root URL', () => {
    expect(isDangerousUrl('https://example.com/')).toBe(false);
  });
});

// ── buildWgetArgs ────────────────────────────────────────────────────────────

describe('buildWgetArgs', () => {
  const args = buildWgetArgs('https://example.com', '/tmp/out');

  it('includes --server-response', () => {
    expect(args).toContain('--server-response');
  });

  it('includes --no-clobber', () => {
    expect(args).toContain('--no-clobber');
  });

  it('includes --recursive', () => {
    expect(args).toContain('--recursive');
  });

  it('includes --convert-links', () => {
    expect(args).toContain('--convert-links');
  });

  it('includes --page-requisites', () => {
    expect(args).toContain('--page-requisites');
  });

  it('includes --no-parent', () => {
    expect(args).toContain('--no-parent');
  });

  it('includes the output directory', () => {
    expect(args.some(a => a.includes('/tmp/out'))).toBe(true);
  });

  it('includes the URL as the last argument', () => {
    expect(args[args.length - 1]).toBe('https://example.com');
  });
});

// ── downloadPage ─────────────────────────────────────────────────────────────

describe('downloadPage', () => {
  it('rejects dangerous URLs immediately without spawning wget', async () => {
    const result = await downloadPage('https://example.com/malware.exe', '/tmp/out');
    expect(result.error).toMatch(/dangerous/i);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('parses HTTP status code from stderr "HTTP/1.1 200 OK"', async () => {
    mockedSpawn.mockReturnValueOnce(makeChild('  HTTP/1.1 200 OK\r\n') as ReturnType<typeof spawn>);
    const result = await downloadPage('https://example.com/', '/tmp/out');
    expect(result.statusCode).toBe(200);
  });

  it('parses HTTP status code 404 from stderr', async () => {
    mockedSpawn.mockReturnValueOnce(makeChild('  HTTP/1.1 404 Not Found\r\n') as ReturnType<typeof spawn>);
    const result = await downloadPage('https://example.com/missing', '/tmp/out');
    expect(result.statusCode).toBe(404);
  });

  it('parses Last-Modified header from stderr', async () => {
    const stderr = '  HTTP/1.1 200 OK\r\n  Last-Modified: Thu, 01 Jan 2026 00:00:00 GMT\r\n';
    mockedSpawn.mockReturnValueOnce(makeChild(stderr) as ReturnType<typeof spawn>);
    const result = await downloadPage('https://example.com/', '/tmp/out');
    expect(result.lastModified).toBeInstanceOf(Date);
    expect(result.lastModified?.getFullYear()).toBe(2026);
  });

  it('returns no lastModified when header is absent', async () => {
    mockedSpawn.mockReturnValueOnce(makeChild('  HTTP/1.1 200 OK\r\n') as ReturnType<typeof spawn>);
    const result = await downloadPage('https://example.com/', '/tmp/out');
    expect(result.lastModified).toBeUndefined();
  });

  it('returns no statusCode when stderr has no HTTP line', async () => {
    mockedSpawn.mockReturnValueOnce(makeChild('some other output\n') as ReturnType<typeof spawn>);
    const result = await downloadPage('https://example.com/', '/tmp/out');
    expect(result.statusCode).toBeUndefined();
  });
});
