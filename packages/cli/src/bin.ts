#!/usr/bin/env node
import { main } from './cli.js';
import { processIo } from './io.js';

process.exitCode = await main(process.argv.slice(2), processIo());
