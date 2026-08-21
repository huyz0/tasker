import { type Interceptor } from '@connectrpc/connect';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { getTracer, withExtractedContext, failSpan } from './otel';
import { currentPrincipalKey } from '../../modules/auth/session';
import { getRequestContext } from '../requestContext';

/**
 * One span per RPC (M11-T02).
 *
 * Placed *outside* the session interceptor in the chain, so the span covers
 * authentication too — "why was this slow" has a credential lookup in it often
 * enough to matter, and a span that starts after authorization would hide it.
 * The consequence is that the principal is not known when the span opens, so
 * the attributes that describe *who* are set on the way out, from the context
 * the session interceptor filled in.
 */

/** Attribute names, kept together because a typo here is a silently empty facet. */
export const ATTR = {
  service: 'rpc.service',
  method: 'rpc.method',
  system: 'rpc.system',
  outcome: 'rpc.outcome',
  errorCode: 'rpc.connect_rpc.error_code',
  principalKind: 'tasker.principal.kind',
  orgId: 'tasker.org.id',
  requestId: 'tasker.request.id',
} as const;

/**
 * The facets worth having on a span, from what the request produced.
 *
 * Deliberately not the payload: a span carrying task titles or artifact
 * content is a copy of the database in a system with different access rules.
 * Ids and kinds answer "which tenant, which caller, which method" without
 * moving anything sensitive into the tracing backend.
 */
export function spanAttributesFor(input: {
  service: string;
  method: string;
  principal?: { kind?: string } | null;
  orgId?: string;
  requestId?: string;
}): Record<string, string> {
  return {
    [ATTR.system]: 'connect_rpc',
    [ATTR.service]: input.service,
    [ATTR.method]: input.method,
    ...(input.principal?.kind ? { [ATTR.principalKind]: input.principal.kind } : {}),
    ...(input.orgId ? { [ATTR.orgId]: input.orgId } : {}),
    ...(input.requestId ? { [ATTR.requestId]: input.requestId } : {}),
  };
}

/** The `code` a ConnectError carries, or nothing for anything else. */
export function connectErrorCode(err: unknown): string | undefined {
  const code = (err as any)?.code;
  return typeof code === 'string' ? code : undefined;
}

export const tracingInterceptor: Interceptor = (next) => async (req) => {
  const service = req.method.parent.typeName;
  const method = req.method.name;

  // A caller that already has a trace — the GUI, another service, a test
  // harness — continues it rather than starting a second one for the same
  // work. Connect's header object is not a plain record, so it is flattened
  // into one the propagator can read.
  const carrier: Record<string, string> = {};
  req.header.forEach((value: string, key: string) => {
    carrier[key.toLowerCase()] = value;
  });

  return withExtractedContext(carrier, () =>
    getTracer().startActiveSpan(
      `${service}/${method}`,
      { kind: SpanKind.SERVER, attributes: spanAttributesFor({ service, method }) },
      async (span) => {
        try {
          const res = await next(req);
          // Read *after* the handler: the principal and the acting org are
          // resolved by interceptors and authorization checks that run inside
          // this span, not before it.
          const ctx = getRequestContext();
          span.setAttributes(
            spanAttributesFor({
              service,
              method,
              principal: req.contextValues.get(currentPrincipalKey) as any,
              orgId: ctx?.orgId,
              requestId: ctx?.requestId,
            }),
          );
          span.setAttribute(ATTR.outcome, 'ok');
          span.setStatus({ code: SpanStatusCode.OK });
          return res;
        } catch (err) {
          span.setAttribute(ATTR.outcome, 'error');
          const code = connectErrorCode(err);
          if (code) span.setAttribute(ATTR.errorCode, code);
          failSpan(span, err);
          throw err;
        } finally {
          span.end();
        }
      },
    ),
  );
};
