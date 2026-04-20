/**
 * Minimal type declarations for Node.js built-ins used in shared package
 * These supplement the TypeScript lib target which provides base types
 */

// URL global constructor (available since ES2022/lib with URL in global scope)
declare const URL: typeof globalThis.URL;

// Re-export URL from lib for use in the module
export { URL };