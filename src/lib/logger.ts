type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  time: string
  level: LogLevel
  msg: string
  [key: string]: unknown
}

function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  const entry: LogEntry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...fields,
  }
  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(JSON.stringify(entry) + '\n')
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
}
