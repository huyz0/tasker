const files = [
  'src/test/wire/atomicRecovery.integration.test.ts',
  'src/test/wire/domainEventRecovery.integration.test.ts',
  'src/test/wire/scheduleRecovery.integration.test.ts',
  'src/test/wire/durableEvents.integration.test.ts',
  'src/test/wire/twoInstance.integration.test.ts',
];
const result = Bun.spawnSync({ cmd: [process.execPath, 'test', ...files],
  env: { ...process.env, TASKER_REAL_INTEGRATION: '1', TASKER_MYSQL_INTEGRATION: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
  stdout: 'pipe', stderr: 'pipe', timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
const decode = new TextDecoder(), out = decode.decode(result.stdout), errors = decode.decode(result.stderr), report = out + '\n' + errors;
process.stdout.write(out);process.stderr.write(errors);
const count = label => Number(new RegExp('(?:^|\\n)\\s*(\\d+)\\s+' + label + '\\b').exec(report)?.[1] ?? 0);
if (result.exitCode !== 0 || count('pass') === 0 || count('fail') !== 0 || count('skip') !== 0) {
  throw new Error('Required MySQL recovery must execute every selected case without skips or failures.');
}
