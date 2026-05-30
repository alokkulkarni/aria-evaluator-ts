#!/usr/bin/env node

export {};
process.env['EVAL_PROVIDER'] = 'openapi';
await import('./run.js');
