import { describe, it, expect } from 'bun:test';
import {
  readMailerConfig,
  createMailer,
  GMAIL_HOST,
  DEFAULT_SMTP_PORT,
  type MailTransport,
  type MailMessage,
  type SendOutcome,
} from './mailer';

const message: MailMessage = { to: 'a@b.test', subject: 's', text: 't', html: '<p>t</p>' };

/** Records what would have been sent, without opening a socket. */
function recordingTransport(behaviour: 'ok' | 'throw' = 'ok') {
  const sent: any[] = [];
  const transport: MailTransport = {
    sendMail: async (options) => {
      if (behaviour === 'throw') throw new Error('ECONNREFUSED');
      sent.push(options);
      return {};
    },
  };
  return { transport, sent };
}

describe('readMailerConfig', () => {
  it('has no host when none is configured, which is what disables it', () => {
    // The same rule the OTLP exporter follows: the standalone binary must not
    // try to reach a service that is not there.
    expect(readMailerConfig({}).host).toBeUndefined();
  });

  it("defaults to Gmail's documented port", () => {
    expect(readMailerConfig({ SMTP_HOST: GMAIL_HOST }).port).toBe(DEFAULT_SMTP_PORT);
  });

  it('derives implicit TLS from the port rather than asking for it', () => {
    // 465 is implicit TLS; 587 and everything else is STARTTLS. Setting this
    // by hand and getting it backwards produces a hang, not an error.
    expect(readMailerConfig({ SMTP_HOST: GMAIL_HOST, SMTP_PORT: '465' }).secure).toBe(true);
    expect(readMailerConfig({ SMTP_HOST: GMAIL_HOST, SMTP_PORT: '587' }).secure).toBe(false);
    expect(readMailerConfig({ SMTP_HOST: 'localhost', SMTP_PORT: '1025' }).secure).toBe(false);
  });

  it('falls back to the authenticating user for the From address', () => {
    // Gmail rejects a From that is not the authenticated account anyway, so
    // this is the answer that works rather than a convenience.
    expect(readMailerConfig({ SMTP_HOST: GMAIL_HOST, SMTP_USER: 'me@gmail.com' }).from).toBe('me@gmail.com');
    expect(readMailerConfig({ SMTP_HOST: GMAIL_HOST, SMTP_USER: 'me@gmail.com', SMTP_FROM: 'noreply@x.test' }).from)
      .toBe('noreply@x.test');
  });

  it('reads where the app lives, for the link in the message', () => {
    expect(readMailerConfig({}).appUrl).toBe('http://localhost:5173');
    expect(readMailerConfig({ APP_URL: 'https://tasker.example.com' }).appUrl).toBe('https://tasker.example.com');
  });

  it('ignores an unparseable port rather than passing NaN to a socket', () => {
    expect(readMailerConfig({ SMTP_PORT: 'abc' }).port).toBe(DEFAULT_SMTP_PORT);
  });
});

describe('a mailer with nothing configured', () => {
  it('is disabled, and reports every send as skipped', async () => {
    const mailer = createMailer(readMailerConfig({}));
    expect(mailer.enabled).toBe(false);
    const outcome: SendOutcome = await mailer.send(message);
    expect(outcome).toBe('skipped');
  });

  it('still knows the app URL, so a caller does not have to branch', async () => {
    expect(createMailer(readMailerConfig({ APP_URL: 'https://x.test' })).appUrl).toBe('https://x.test');
  });

  it('constructs no transport at all', async () => {
    // The point of the disabled path: nothing is built, so nothing can attempt
    // a connection at startup or on the first send.
    let built = false;
    const mailer = createMailer(readMailerConfig({}), {
      sendMail: async () => {
        built = true;
        return {};
      },
    });
    await mailer.send(message);
    expect(built).toBe(false);
  });
});

describe('a configured mailer', () => {
  const config = readMailerConfig({ SMTP_HOST: 'localhost', SMTP_PORT: '1025', SMTP_FROM: 'tasker@localhost' });

  it('sends, and says so', async () => {
    const { transport, sent } = recordingTransport();
    const mailer = createMailer(config, transport);

    expect(await mailer.send(message)).toBe('sent');
    expect(sent).toHaveLength(1);
  });

  it('sends from the configured address', async () => {
    const { transport, sent } = recordingTransport();
    await createMailer(config, transport).send(message);
    expect(sent[0].from).toBe('tasker@localhost');
  });

  it('passes both a text and an HTML part', async () => {
    // A text-only invitation looks broken in a modern client; an HTML-only one
    // is unreadable in a plain-text one and scores worse with spam filters.
    const { transport, sent } = recordingTransport();
    await createMailer(config, transport).send(message);
    expect(sent[0].text).toBe('t');
    expect(sent[0].html).toBe('<p>t</p>');
  });

  it('reports a failure rather than throwing it at the caller', async () => {
    // Every caller is doing something else that already succeeded — an
    // invitation row exists. Failing that because a mail server was
    // unreachable would trade a missing email for a lost write.
    const { transport } = recordingTransport('throw');
    expect(await createMailer(config, transport).send(message)).toBe('failed');
  });
});
