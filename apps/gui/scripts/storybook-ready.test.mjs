import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { storyCompletionState } from './storybook-ready.mjs';

function state({ phase = 'finished', status = 'success', finishId = 'wanted', renderId = 'wanted', preparedId = 'wanted', events = {}, body = 'sb-show-main', channel = true } = {}) {
  const retained = { storyFinished: [{ storyId: finishId, status, reporters: [] }], ...events };
  const runtime = {
    document: { body: { classList: { contains: name => name === body } } },
    __STORYBOOK_ADDONS_CHANNEL__: channel ? { last: name => retained[name] } : undefined,
    __STORYBOOK_PREVIEW__: { currentRender: { id: renderId, type: 'story', story: { id: preparedId }, phase } },
  };
  return JSON.parse(JSON.stringify(runInNewContext(`(${storyCompletionState.toString()})('wanted')`, runtime)));
}

test('visible is not complete: mounting, play, completed and afterEach must finish', () => {
  for (const phase of ['preparing', 'loading', 'rendering', 'playing', 'played', 'completing', 'completed', 'afterEach']) assert.equal(state({ phase }), false, phase);
});
test('waits for the matching completion and prepared/current story', () => {
  for (const key of ['finishId', 'renderId', 'preparedId']) assert.equal(state({ [key]: 'another-story' }), false, key);
  assert.equal(state({ channel: false }), false);
});
test('successful completion permits a component that intentionally renders nothing', () => {
  assert.equal(state().ok, true);
});
test('finished with an error is a failure even with a visible body', () => {
  assert.equal(state({ status: 'error' }).ok, false);
  for (const phase of ['errored', 'aborted']) assert.equal(state({ phase }).ok, false);
});
for (const event of ['storyMissing', 'storyErrored', 'storyThrewException', 'playFunctionThrewException', 'unhandledErrorsWhilePlaying']) {
  test(`rejects retained ${event}, including a zero-argument emission`, () => {
    assert.equal(state({ events: { [event]: [] } }).ok, false);
  });
}
test('preview error/no-preview screens fail independently of lifecycle status', () => {
  for (const body of ['sb-show-errordisplay', 'sb-show-nopreview']) assert.equal(state({ body }).ok, false);
});
