#!/usr/bin/env node

export {};
process.env['EVAL_PROVIDER'] = 'websocket';
await import('./run.js');
