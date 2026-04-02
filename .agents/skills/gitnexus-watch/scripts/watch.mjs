#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../../..');
const PID_FILE = path.join(workspaceRoot, '.gitnexus-watch.pid');

if (fs.existsSync(PID_FILE)) {
    const existingPid = fs.readFileSync(PID_FILE, 'utf8').trim();
    try {
        process.kill(parseInt(existingPid, 10), 0);
        console.log(`GitNexus watcher is already running in this workspace (PID: ${existingPid}).`);
        process.exit(0);
    } catch (e) {
        // PID is stale, we can safely overwrite it
    }
}

fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');

const cleanup = () => {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
});

console.log('Starting initial GitNexus analysis...');

const runner = process.versions.bun ? 'bunx' : 'npx';
const analyzeArgs = process.versions.bun ? ['--bun', 'gitnexus', 'analyze'] : ['--yes', 'gitnexus', 'analyze'];

const analyze = spawn(runner, analyzeArgs, { stdio: 'inherit', shell: true });

analyze.on('close', () => {
    console.log('Starting background watcher...');
    
    const chokidarArgs = [
        process.versions.bun ? '' : '--yes',
        'chokidar-cli',
        '**/*.ts', '**/*.go', '**/*.md', '**/*.py', '**/*.js',
        '-i', '\\.git', '-i', 'node_modules', '-i', '\\.moon', '-i', 'dist',
        '-c', `echo "Change detected." && ${runner} gitnexus analyze`
    ].filter(Boolean);
    
    const watcher = spawn(runner, chokidarArgs, { stdio: 'inherit', shell: true });
    
    // Automatically kill child watcher when parent exits
    process.on('exit', () => watcher.kill());
});
