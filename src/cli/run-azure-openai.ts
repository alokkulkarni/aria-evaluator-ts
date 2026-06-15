#!/usr/bin/env node

export {};
process.env['EVAL_PROVIDER'] = 'azure-openai';
await import('./run.js');
