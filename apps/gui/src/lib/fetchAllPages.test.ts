import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages } from './fetchAllPages';

describe('fetchAllPages', () => {
  it('returns items from a single page when there is no next cursor', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [1, 2, 3], nextCursor: undefined });
    const result = await fetchAllPages(fetchPage);
    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it('follows cursors across multiple pages and concatenates items in order', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ['a', 'b'], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: ['c'], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: ['d'], nextCursor: undefined });

    const result = await fetchAllPages(fetchPage);

    expect(result).toEqual(['a', 'b', 'c', 'd']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'cursor-1');
    expect(fetchPage).toHaveBeenNthCalledWith(3, 'cursor-2');
  });

  it('propagates a rejection from a page fetch instead of looping forever', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(new Error('network error'));

    await expect(fetchAllPages(fetchPage)).rejects.toThrow('network error');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array when the first page has no items and no cursor', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [], nextCursor: undefined });
    const result = await fetchAllPages(fetchPage);
    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
