/**
 * Serialized into each fresh iframe. Storybook10.6 retains channel events;
 * storyFinished follows play/afterEach, while sb-show-main precedes mount.
 * Keep this contract covered when upgrading Storybook. Error events with no
 * arguments still exist: last(event) returns [] rather than undefined.
 */
export function storyCompletionState(storyId) {
  const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
  const errors = ['storyMissing', 'storyErrored', 'storyThrewException',
    'playFunctionThrewException', 'unhandledErrorsWhilePlaying']
    .filter(event => channel?.last?.(event) !== undefined);
  const body = document.body;
  if (errors.length || body.classList.contains('sb-show-errordisplay') || body.classList.contains('sb-show-nopreview')) {
    return { ok: false, reason: errors.join(', ') || 'preview error screen' };
  }
  const finished = channel?.last?.('storyFinished')?.[0];
  const render = globalThis.__STORYBOOK_PREVIEW__?.currentRender;
  if (render?.id === storyId && ['errored', 'aborted'].includes(render.phase)) {
    return { ok: false, reason: `render ${render.phase}` };
  }
  if (finished?.storyId !== storyId || render?.id !== storyId || render?.story?.id !== storyId || render.phase !== 'finished') return false;
  const reports = (finished.reporters ?? []).filter(report => report.status === 'failed')
    .map(report => `${report.type}: ${(report.result?.violations ?? []).map(violation => `${violation.id} ${violation.nodes?.map(node => node.target.join(' ')).join(', ')}`).join('; ')}`);
  return { ok: finished.status === 'success', reason: `story finished: ${finished.status}${reports.length ? ` (${reports.join('; ')})` : ''}` };
}

/** Wait for matching success, not a visible shell, network quiet or old result. */
export async function waitForStory(page, storyId) {
  const handle = await page.waitForFunction(storyCompletionState, storyId, { timeout: 20000 });
  try {
    const state = await handle.jsonValue();
    if (!state.ok) throw new Error(`Preview failed to render: ${storyId} (${state.reason})`);
  } finally {
    await handle.dispose();
  }
}
