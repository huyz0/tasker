import { describe, it, expect } from 'bun:test';
import { renderInviteEmail, escapeHtml, describeExpiry, describeIdentity } from './inviteEmail';

const base = {
  email: 'invitee@example.com',
  orgName: 'Acme',
  invitedByName: 'Dana',
  role: 'member',
  appUrl: 'https://tasker.example.com',
  expiresAt: null,
};

describe('escapeHtml', () => {
  it('escapes the characters that would break out of the document', () => {
    // An organization name is typed by a user and a display name comes from an
    // OAuth provider — both reach the HTML body, and an unescaped
    // `<img onerror=…>` executes in whichever mail client renders it.
    expect(escapeHtml('<img onerror="x">')).toBe('&lt;img onerror=&quot;x&quot;&gt;');
  });

  it('escapes the ampersand first, so an escape is not double-escaped', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it("escapes a single quote, which closes an attribute just as well as a double", () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });
});

describe('describeExpiry', () => {
  const now = new Date('2026-08-22T00:00:00Z');

  it('answers the question the reader has, in days', () => {
    // "How long do I have", not a UTC timestamp they have to convert.
    expect(describeExpiry(new Date('2026-09-05T00:00:00Z'), now)).toBe('This invitation expires in 14 days.');
  });

  it('says "1 day", not "1 days"', () => {
    expect(describeExpiry(new Date('2026-08-23T00:00:00Z'), now)).toBe('This invitation expires in 1 day.');
  });

  it('drops to hours when a day would round to zero', () => {
    expect(describeExpiry(new Date('2026-08-22T05:00:00Z'), now)).toBe('This invitation expires in 5 hours.');
  });

  it('never says "in 0 hours" for something about to lapse', () => {
    expect(describeExpiry(new Date('2026-08-22T00:01:00Z'), now)).toBe('This invitation expires in 1 hour.');
  });

  it('says so plainly when it has already lapsed', () => {
    expect(describeExpiry(new Date('2026-08-21T00:00:00Z'), now)).toBe('This invitation has already expired.');
  });

  it('has nothing to say about an invitation with no expiry', () => {
    // Rows predating M03-T11 have none, and inventing one would be a lie.
    expect(describeExpiry(null, now)).toBeNull();
  });
});

describe('describeIdentity', () => {
  it('names the address, so the recipient signs in with the right one', () => {
    // Acceptance matches on the identity they prove. Signing in with a
    // different address joins nothing and looks like a broken invitation.
    expect(describeIdentity({ ...base })).toContain('invitee@example.com');
  });

  it('names the username for a username-targeted invitation', () => {
    expect(describeIdentity({ ...base, email: null, username: 'dana' })).toContain('the username dana');
  });
});

describe('renderInviteEmail', () => {
  it('names who, which organization and which role in the subject', () => {
    // The subject is all most people read before deciding whether to open it.
    expect(renderInviteEmail(base).subject).toBe('Dana invited you to Acme on Tasker');
  });

  it('carries no accept link, because acceptance is not a bearer token', () => {
    // `consumePendingInvitations` redeems on the identity a person *proves* at
    // sign-in. A link that granted membership to whoever forwarded the email
    // would be a real escalation path, and there is deliberately none.
    const { text, html } = renderInviteEmail(base);
    for (const body of [text, html]) {
      expect(body).not.toMatch(/token|accept\?|invite_id|\/invitations\//i);
    }
  });

  it('points at the app', () => {
    const { text } = renderInviteEmail(base);
    expect(text).toContain('https://tasker.example.com');
  });

  it('includes the expiry when there is one', () => {
    const rendered = renderInviteEmail(
      { ...base, expiresAt: new Date('2026-09-05T00:00:00Z') },
      new Date('2026-08-22T00:00:00Z'),
    );
    expect(rendered.text).toContain('expires in 14 days');
    expect(rendered.html).toContain('expires in 14 days');
  });

  it('omits the expiry line entirely rather than rendering an empty one', () => {
    const rendered = renderInviteEmail(base);
    expect(rendered.text).not.toContain('expires');
    expect(rendered.html).not.toContain('expires');
  });

  it('tells an unexpecting recipient that ignoring it is safe', () => {
    // True, and worth saying: nothing happens until they sign in.
    expect(renderInviteEmail(base).text).toContain('you can ignore it');
  });

  it('escapes a hostile organization name in the HTML body', () => {
    const rendered = renderInviteEmail({ ...base, orgName: '<script>alert(1)</script>' });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('escapes a hostile display name too', () => {
    // It arrives from an OAuth provider, which is not a trust boundary.
    const rendered = renderInviteEmail({ ...base, invitedByName: '<b>Dana</b>' });
    expect(rendered.html).not.toContain('<b>Dana</b>');
  });

  it('leaves the plain-text part unescaped, where escaping would be noise', () => {
    // A text/plain body renders nothing, so `&lt;` there is just wrong.
    const rendered = renderInviteEmail({ ...base, orgName: 'A & B' });
    expect(rendered.text).toContain('A & B');
  });

  it('produces a body for a username-targeted invitation too', () => {
    const rendered = renderInviteEmail({ ...base, email: null, username: 'dana' });
    expect(rendered.text).toContain('the username dana');
  });
});
