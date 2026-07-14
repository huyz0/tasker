import { describe, it, expect } from 'bun:test';
import { problemDetails } from './problemDetails';

describe('problemDetails', () => {
  it('returns an RFC7807-shaped JSON body with the application/problem+json content type', async () => {
    const res = problemDetails(400, 'Bad input', 'the field x is required');

    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    const body = await res.json();
    expect(body).toEqual({ type: 'about:blank', title: 'Bad input', status: 400, detail: 'the field x is required' });
  });

  it('omits the detail field when none is given', async () => {
    const res = problemDetails(403, 'Forbidden');
    const body = await res.json();
    expect(body).toEqual({ type: 'about:blank', title: 'Forbidden', status: 403 });
  });
});
