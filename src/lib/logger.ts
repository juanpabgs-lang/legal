import pino from 'pino';
import { getConfig } from '../config';

export function createLogger(name?: string) {
  const cfg = getConfig();
  return pino({
    name,
    level: cfg.LOG_LEVEL,
    ...(cfg.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : {}),
  });
}

export const logger = createLogger('norfront');
