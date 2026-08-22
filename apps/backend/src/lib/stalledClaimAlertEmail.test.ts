import { describe, it, expect } from 'bun:test';
import { renderStalledClaimAlertEmail, type StalledClaimAlertEmailInput, type StalledTaskItem } from './stalledClaimAlertEmail';

const task = (over: Partial<StalledTaskItem> = {}): StalledTaskItem => ({
  taskDisplayId: 'ENG-42',
  taskTitle: 'Fix the thing',
  agentName: 'Builder-1',
  neverStarted: true,
  hoursSilent: 30,
  taskUrl: 'https://tasker.example.com/tasks/tsk-1',
  ...over,
});

const base: StalledClaimAlertEmailInput = {
  recipientName: 'Dana',
  reason: 'reviewer',
  orgName: 'Acme',
  tasks: [task()],
  overflowCount: 0,
  appUrl: 'https://tasker.example.com',
};

describe('renderStalledClaimAlertEmail', () => {
  it('names the count in the subject, plural', () => {
    const rendered = renderStalledClaimAlertEmail({ ...base, tasks: [task(), task({ taskDisplayId: 'ENG-43' })] });
    expect(rendered.subject).toBe('2 stalled tasks need your attention');
  });

  it('uses the singular form for exactly one task', () => {
    const rendered = renderStalledClaimAlertEmail(base);
    expect(rendered.subject).toBe('1 stalled task needs your attention');
  });

  it('includes overflow in the subject count even though it is not itemized', () => {
    const rendered = renderStalledClaimAlertEmail({ ...base, overflowCount: 3 });
    expect(rendered.subject).toBe('4 stalled tasks need your attention');
  });

  it('states the reviewer reason, naming the task, for a single-task reviewer digest', () => {
    const rendered = renderStalledClaimAlertEmail(base);
    expect(rendered.text).toContain("you review ENG-42");
  });

  it('states the admin fallback reason, naming the org', () => {
    const rendered = renderStalledClaimAlertEmail({ ...base, reason: 'admin' });
    expect(rendered.text).toContain('no reviewer assigned');
    expect(rendered.text).toContain('Acme');
  });

  it('itemizes each task: display id, title, agent name, hours silent, and a link', () => {
    const rendered = renderStalledClaimAlertEmail({
      ...base,
      tasks: [task({ taskDisplayId: 'ENG-7', taskTitle: 'Ship the widget', agentName: 'Agent-Bob', hoursSilent: 48, taskUrl: 'https://tasker.example.com/tasks/tsk-7' })],
    });
    expect(rendered.text).toContain('ENG-7');
    expect(rendered.text).toContain('Ship the widget');
    expect(rendered.text).toContain('Agent-Bob');
    expect(rendered.text).toContain('48 hours');
    expect(rendered.text).toContain('https://tasker.example.com/tasks/tsk-7');
  });

  it('distinguishes never-started from went-quiet phrasing', () => {
    const neverStarted = renderStalledClaimAlertEmail({ ...base, tasks: [task({ neverStarted: true })] });
    const wentQuiet = renderStalledClaimAlertEmail({ ...base, tasks: [task({ neverStarted: false })] });
    expect(neverStarted.text).toContain('never started');
    expect(wentQuiet.text).toContain('went quiet');
    expect(neverStarted.text).not.toContain('went quiet');
    expect(wentQuiet.text).not.toContain('never started');
  });

  it('says "1 hour", not "1 hours"', () => {
    const rendered = renderStalledClaimAlertEmail({ ...base, tasks: [task({ hoursSilent: 1 })] });
    expect(rendered.text).toContain('1 hour.');
  });

  it('shows a "+N more" line only when there is overflow', () => {
    const capped = renderStalledClaimAlertEmail({ ...base, overflowCount: 5 });
    expect(capped.text).toContain('5 more');
    expect(capped.html).toContain('5 more');

    const uncapped = renderStalledClaimAlertEmail({ ...base, overflowCount: 0 });
    expect(uncapped.text).not.toContain('more tasks not shown');
    expect(uncapped.html).not.toContain('more tasks not shown');
  });

  it('tells the recipient to unassign or reassign, not comment - the footgun a comment would be', () => {
    const rendered = renderStalledClaimAlertEmail(base);
    expect(rendered.text).toMatch(/unassign|reassign/i);
    expect(rendered.text).toContain('read as new');
  });

  it('carries no accept-link-style secret, only a plain task URL', () => {
    const rendered = renderStalledClaimAlertEmail(base);
    for (const body of [rendered.text, rendered.html]) {
      expect(body).not.toMatch(/token|accept\?|invite_id/i);
    }
  });

  it('escapes a hostile task title in the HTML body', () => {
    const rendered = renderStalledClaimAlertEmail({ ...base, tasks: [task({ taskTitle: '<script>alert(1)</script>' })] });
    expect(rendered.html).not.toContain('<script>alert(1)</script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('escapes a hostile agent name and org name in the HTML body', () => {
    const rendered = renderStalledClaimAlertEmail({
      ...base,
      reason: 'admin',
      orgName: '<b>Acme</b>',
      tasks: [task({ agentName: '<img onerror=x>' })],
    });
    expect(rendered.html).not.toContain('<b>Acme</b>');
    expect(rendered.html).not.toContain('<img onerror=x>');
  });

  it('leaves the plain-text part unescaped', () => {
    const rendered = renderStalledClaimAlertEmail({ ...base, tasks: [task({ taskTitle: 'A & B' })] });
    expect(rendered.text).toContain('A & B');
  });
});
