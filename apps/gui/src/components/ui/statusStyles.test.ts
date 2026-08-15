import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TONE_CLASSES, buildTone, pullRequestTone, type StatusTone } from './statusStyles';

const CSS = readFileSync(join(__dirname, '../../index.css'), 'utf8');

describe('the status scale', () => {
  it('names all five steps the design system documents', () => {
    expect(Object.keys(TONE_CLASSES).sort()).toEqual(
      ['destructive', 'info', 'neutral', 'success', 'warning'],
    );
  });

  it('spells every tone as a token pair, never as an alpha tint', () => {
    for (const [tone, classes] of Object.entries(TONE_CLASSES)) {
      // `bg-success/10 text-success` is a fourth colour the contrast gate
      // cannot see: it reads token pairs, not arbitrary utilities.
      expect(classes, tone).toBe(`bg-${tone}-subtle text-${tone}-subtle-foreground`);
      expect(classes, tone).not.toMatch(/\//);
    }
  });

  it('uses only tokens that index.css actually defines', () => {
    for (const tone of Object.keys(TONE_CLASSES) as StatusTone[]) {
      // A class naming a token nobody defined renders as no colour at all, and
      // looks exactly like an unstyled badge.
      expect(CSS, tone).toContain(`--${tone}-subtle:`);
      expect(CSS, tone).toContain(`--${tone}-subtle-foreground:`);
    }
  });
});

describe('build states', () => {
  it('maps the three states the providers report', () => {
    expect(buildTone('SUCCESS')).toBe('success');
    expect(buildTone('FAILURE')).toBe('destructive');
    expect(buildTone('PENDING')).toBe('warning');
  });

  it('accepts the state in either case', () => {
    expect(buildTone('success')).toBe('success');
  });

  it('gives an unrecognised state a deliberate grey, not nothing', () => {
    // The old fallback was `bg-muted text-muted-foreground`, which reads as an
    // unstyled badge sitting next to styled ones.
    expect(buildTone('CANCELLED')).toBe('neutral');
    expect(buildTone('')).toBe('neutral');
  });
});

describe('pull request states', () => {
  it('maps open, merged, closed and draft to distinct meanings', () => {
    expect(pullRequestTone('open')).toBe('success');
    expect(pullRequestTone('merged')).toBe('info');
    expect(pullRequestTone('closed')).toBe('destructive');
    expect(pullRequestTone('draft')).toBe('neutral');
  });

  it('does not colour a merged PR as a failure', () => {
    // Merged is the good outcome; only `closed` — closed without merging — is
    // the bad one, and the two are one word apart.
    expect(pullRequestTone('merged')).not.toBe('destructive');
  });
});

describe('the badges that report the same state', () => {
  it('render it with the same classes', () => {
    // M06-T01's verify line. BuildBadge used the subtle pairs while
    // RepositoryIntegrationConfig used `bg-success/10 text-success` for the
    // same build result, so the same green appeared as two different greens on
    // one screen.
    expect(TONE_CLASSES[buildTone('SUCCESS')]).toBe(TONE_CLASSES[pullRequestTone('open')]);
  });

  it('is the only place either component decides a colour', () => {
    const sources = [
      'BuildBadge.tsx',
      'ui/repositories/RepositoryIntegrationConfig.tsx',
    ]
      .map((f) => readFileSync(join(__dirname, '../..', 'components', f), 'utf8'))
      // Comments are stripped first: both files explain the old
      // `bg-success/10` they replaced, and a comment is not a colour decision.
      .map((src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));

    for (const src of sources) {
      // A component picks *what state this is*; it never picks what colour that
      // is. Reintroducing a literal here is how the three renderings diverged.
      expect(src).not.toMatch(/bg-(success|warning|info|neutral|destructive)(-subtle)?\b/);
    }
  });
});
