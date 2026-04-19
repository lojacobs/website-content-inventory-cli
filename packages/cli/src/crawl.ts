#!/usr/bin/env node
/**
 * fci-crawl entrypoint (packages/cli re-export)
 * Delegates to @fci/crawler's CLI implementation.
 */

// Re-export the crawler CLI - this file exists so the monorepo CLI package
// can expose fci-crawl as a bin without duplicating logic.
import '@fci/crawler/cli';
