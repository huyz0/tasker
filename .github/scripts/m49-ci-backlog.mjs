// One-off M49 maintenance. Remove this file and its workflow before publication.
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.TASKER_ACTIONS_TOKEN;
const expectedHead = process.env.TASKER_EXPECTED_HEAD;
if (repository !== 'huyz0/tasker' || process.env.GITHUB_EVENT_NAME !== 'pull_request'
  || process.env.GITHUB_HEAD_REF !== 'feature/m49-bounded-load'
  || !token || !/^[0-9a-f]{40}$/.test(expectedHead || '')) throw new Error('Unexpected maintenance context.');
const candidates = [
  {
    "id": 44894116487,
    "pr": 18,
    "branch": "feature/m49-cross-process",
    "head": "96f7a2a3eecf740215ce27a13c0607afb79f2631"
  },
  {
    "id": 44895096569,
    "pr": 18,
    "branch": "feature/m49-cross-process",
    "head": "1d47090c067a320e0346a7270fca88ffdf84785a"
  },
  {
    "id": 44896116258,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "4d995a2a79b4f51ac8335aaac65245a66768c4f5"
  },
  {
    "id": 44896116322,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "4d995a2a79b4f51ac8335aaac65245a66768c4f5"
  },
  {
    "id": 44896443111,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "9f0368271c38dd9d13dd3ebb1420ca9bb06fd4f7"
  },
  {
    "id": 44896443085,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "9f0368271c38dd9d13dd3ebb1420ca9bb06fd4f7"
  },
  {
    "id": 44897728901,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "f6aa796456217a5a2aa63793380049f3e11f3873"
  },
  {
    "id": 44897728855,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "f6aa796456217a5a2aa63793380049f3e11f3873"
  },
  {
    "id": 44898921011,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "5461cbd4a1a63fabe7b872fccc60270ec72923e2"
  },
  {
    "id": 44898920997,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "5461cbd4a1a63fabe7b872fccc60270ec72923e2"
  },
  {
    "id": 44899234657,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "f3a69888fd0b53bf3bcbc2fdcb9d735f9378bbdc"
  },
  {
    "id": 44899234609,
    "pr": 19,
    "branch": "feature/m49-bounded-load",
    "head": "f3a69888fd0b53bf3bcbc2fdcb9d735f9378bbdc"
  }
];
const active = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);
async function request(path, method = 'GET') {
  const response = await fetch('https://api.github.com/repos/' + repository + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  if (method === 'POST' && [202, 409, 422].includes(response.status)) return { status: response.status };
  if (!response.ok) throw new Error('GitHub maintenance request failed: ' + response.status);
  return response.json();
}
async function current(pr) {
  const value = await request('/pulls/' + pr);
  return value.state === 'open' && value.head.repo.full_name === repository ? value.head : null;
}
let cancelled = 0, skipped = 0;
for (const candidate of candidates) {
  // If another push superseded this maintenance job, it must not cancel
  // work belonging to that newer head.
  const owner = await current(19);
  if (!owner || owner.sha !== expectedHead || owner.ref !== 'feature/m49-bounded-load') {
    console.log(JSON.stringify({ stopped: 'maintenance head was superseded', cancelled, skipped }));process.exit(0);
  }
  const head = await current(candidate.pr);
  const run = await request('/actions/runs/' + candidate.id);
  const matches = head && head.ref === candidate.branch && head.sha !== candidate.head
    && run.head_sha === candidate.head && run.head_branch === candidate.branch
    && run.event === 'pull_request' && run.pull_requests.some(pr => pr.number === candidate.pr)
    && ['.github/workflows/ci.yml', '.github/workflows/integration.yml'].includes(run.path)
    && active.has(run.status);
  if (!matches) { skipped++;continue; }
  // Recheck the affected PR immediately before the mutation as well.
  const latest = await current(candidate.pr);
  if (!latest || latest.ref !== candidate.branch || latest.sha === candidate.head) { skipped++;continue; }
  const result = await request('/actions/runs/' + candidate.id + '/cancel', 'POST');
  if (result.status === 202) cancelled++;else skipped++;
  console.log(JSON.stringify({ run: candidate.id, pr: candidate.pr, status: result.status }));
}
console.log(JSON.stringify({ cancelled, skipped, scope: 'fixed obsolete task runs only; current heads and main preserved' }));
