/**
 * The invitation email's contents (M12 follow-up).
 *
 * Kept apart from anything that sends: a template is a pure function of the
 * invitation, and the part most likely to be wrong — a name rendered as
 * "undefined", an expiry phrased as a timestamp nobody can read, an address
 * that turns out to be an injection vector — is exactly the part a test can
 * pin down without a mail server anywhere near it.
 *
 * **There is no accept link, deliberately.** Acceptance is not a bearer token
 * in this product: `consumePendingInvitations` in `modules/auth/auth.ts`
 * redeems every pending invitation matching the identity a person *proves* at
 * sign-in. So the email's job is to say which organization, who invited them,
 * and which address to sign in with — not to carry a secret that would grant
 * membership to whoever forwarded it.
 */

export interface InviteEmailInput {
  /** Exactly one of these is set, mirroring the invitation row's own XOR. */
  email?: string | null;
  username?: string | null;
  orgName: string;
  /** Display name of whoever sent it, or their id if they have no name set. */
  invitedByName: string;
  role: string;
  /** Where the person should go to sign in. */
  appUrl: string;
  expiresAt?: Date | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * HTML-escapes a value.
 *
 * Every interpolated field here is attacker-influenced in some deployment: an
 * organization name is typed by a user, and a display name comes from an OAuth
 * provider. An unescaped `<img onerror=…>` in an org name would execute in
 * whichever mail client renders HTML.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * "in 7 days", not an ISO timestamp.
 *
 * The recipient's question is "how long do I have", and a UTC timestamp makes
 * them do timezone arithmetic to answer it.
 */
export function describeExpiry(expiresAt: Date | null | undefined, now: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 'This invitation has already expired.';
  const days = Math.round(ms / 86_400_000);
  if (days >= 1) return `This invitation expires in ${days} day${days === 1 ? '' : 's'}.`;
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return `This invitation expires in ${hours} hour${hours === 1 ? '' : 's'}.`;
}

/** How the recipient is identified when they sign in. */
export function describeIdentity(input: InviteEmailInput): string {
  if (input.email) return `Sign in with this address (${input.email}) and you will join automatically.`;
  return `Sign in with the username ${input.username} and you will join automatically.`;
}

export function renderInviteEmail(input: InviteEmailInput, now: Date = new Date()): RenderedEmail {
  const subject = `${input.invitedByName} invited you to ${input.orgName} on Tasker`;
  const expiry = describeExpiry(input.expiresAt, now);
  const identity = describeIdentity(input);

  const lines = [
    `${input.invitedByName} has invited you to join ${input.orgName} on Tasker as a ${input.role}.`,
    '',
    identity,
    '',
    input.appUrl,
  ];
  if (expiry) lines.push('', expiry);
  lines.push(
    '',
    'If you were not expecting this, you can ignore it — nothing happens until you sign in.',
  );

  const html = `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #111;">
    <p>${escapeHtml(input.invitedByName)} has invited you to join
      <strong>${escapeHtml(input.orgName)}</strong> on Tasker as a
      ${escapeHtml(input.role)}.</p>
    <p>${escapeHtml(identity)}</p>
    <p><a href="${escapeHtml(input.appUrl)}">${escapeHtml(input.appUrl)}</a></p>
    ${expiry ? `<p>${escapeHtml(expiry)}</p>` : ''}
    <p style="color: #666; font-size: 0.9em;">If you were not expecting this, you can ignore it —
      nothing happens until you sign in.</p>
  </body>
</html>`;

  return { subject, text: lines.join('\n'), html };
}
