import nodemailer from 'nodemailer';
import { logger } from './logger';

/**
 * Sending mail (M12 follow-up: invite email).
 *
 * The roadmap carried "invite users by email — record created, never sent" for
 * the life of this repository. The record was always real; the delivery was
 * not. This is the delivery.
 *
 * Configured for **Gmail by default** because that is the account most people
 * running this already have, and because Google's SMTP endpoint is the one
 * that works from a laptop without a domain, a DNS record or a warmed-up
 * sending reputation. It is plain SMTP underneath, so any provider works by
 * pointing `SMTP_HOST` elsewhere.
 *
 * **Disabled unless configured**, exactly like the OTLP exporter (M11-T01) and
 * for the same reason: the standalone binary must not try to reach a service
 * that is not there. With no `SMTP_HOST` the mailer is a no-op that says so
 * once at startup, and every send returns `skipped`.
 */

export interface MailerConfig {
  host?: string;
  port: number;
  /**
   * Implicit TLS on connect (port 465) versus STARTTLS after it (587).
   * Gmail's documented endpoint is 587, which is STARTTLS — so `secure` is
   * false there, which reads backwards and is why it is derived from the port
   * rather than left to be set by hand.
   */
  secure: boolean;
  user?: string;
  password?: string;
  /** The From address. Defaults to the authenticating user, which Gmail requires anyway. */
  from: string;
  /** Where the invitation tells people to go. */
  appUrl: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendOutcome = 'sent' | 'skipped' | 'failed';

export interface Mailer {
  readonly enabled: boolean;
  /**
   * Where a message should tell people to go. Carried here rather than read
   * from the environment at each call site, so there is one answer to "what is
   * this instance's address" and it is configured in one place.
   */
  readonly appUrl: string;
  send(message: MailMessage): Promise<SendOutcome>;
}

export const GMAIL_HOST = 'smtp.gmail.com';
export const DEFAULT_SMTP_PORT = 587;

export function readMailerConfig(env: Record<string, string | undefined>): MailerConfig {
  const port = Number(env.SMTP_PORT) || DEFAULT_SMTP_PORT;
  return {
    host: env.SMTP_HOST || undefined,
    port,
    // Derived, not configured: 465 is implicit TLS and everything else is
    // STARTTLS. Getting this backwards produces a hang rather than an error,
    // which is a miserable thing to debug.
    secure: port === 465,
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from: env.SMTP_FROM || env.SMTP_USER || 'tasker@localhost',
    appUrl: env.APP_URL || 'http://localhost:5173',
  };
}

/**
 * The transport, as this module needs it. A seam rather than nodemailer's own
 * type, so a test can assert what would have been sent without a server.
 */
export interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

/**
 * Not exported: the only legitimate way to get a transport is through
 * `createMailer`, which is also the only place that knows whether one should
 * exist at all.
 */
function createTransport(config: MailerConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Omitted entirely when absent — a local test server accepts unauthenticated
    // mail, and passing `auth: { user: undefined }` makes nodemailer attempt a
    // login the server will reject.
    ...(config.user ? { auth: { user: config.user, pass: config.password } } : {}),
  }) as unknown as MailTransport;
}

/**
 * Builds the mailer.
 *
 * `transport` is injectable so tests never open a socket, and so the
 * connection is not made at import time — with no host configured, nodemailer
 * is never even constructed.
 */
export function createMailer(config: MailerConfig, transport?: MailTransport): Mailer {
  const enabled = Boolean(config.host);
  if (!enabled) {
    logger.info({}, 'mailer.disabled');
    return { enabled: false, appUrl: config.appUrl, send: async () => 'skipped' };
  }

  const resolved = transport ?? createTransport(config);
  logger.info({ host: config.host, port: config.port, secure: config.secure }, 'mailer.configured');

  return {
    enabled: true,
    appUrl: config.appUrl,
    async send(message: MailMessage): Promise<SendOutcome> {
      try {
        await resolved.sendMail({ from: config.from, ...message });
        logger.info({ to: message.to, subject: message.subject }, 'mailer.sent');
        return 'sent';
      } catch (err) {
        // Never thrown onward. Every caller of this is doing something else
        // that already succeeded — an invitation row exists, an account was
        // created — and failing that because a mail server was unreachable
        // would trade a missing email for a lost write.
        logger.error({ err, to: message.to }, 'mailer.send_failed');
        return 'failed';
      }
    },
  };
}
