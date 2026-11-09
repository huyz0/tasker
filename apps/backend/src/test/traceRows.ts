/** Observe actual DB results before handler decoding/response shaping. */
export function traceRows(builder: any, inspect: (rows: any[]) => void): any {
  return new Proxy(builder, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key === 'then') return (resolve: (rows: any[]) => void, reject: (error: unknown) => void) => value.call(target, (rows: any[]) => {
      try { inspect(rows); resolve(rows); } catch (error) { reject(error); }
    }, reject);
    if (typeof value !== 'function') return value;
    return (...args: any[]) => {
      const next = value.apply(target, args);
      return next && typeof next.toSQL === 'function' ? traceRows(next, inspect) : next;
    };
  } });
}

