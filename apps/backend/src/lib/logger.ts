import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

// LOG_FILE is opt-in: without it, logs only go to stdout (the prior
// behavior) and are lost once the terminal/process log buffer scrolls or
// the process restarts. Setting it also writes every log line to that file
// in append mode, so history survives across restarts for later debugging.
const logFilePath = process.env.LOG_FILE;

export const logger = logFilePath
  ? pino({ level }, pino.multistream([
      { stream: process.stdout },
      { stream: pino.destination({ dest: logFilePath, mkdir: true, append: true }) },
    ]))
  : pino({ level });
