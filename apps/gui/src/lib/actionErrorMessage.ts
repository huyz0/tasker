import { ConnectError } from '@connectrpc/connect';

/** Keep the server's explanation without exposing its transport prefix. */
export function actionErrorMessage(error: Error): string {
  return error instanceof ConnectError ? error.rawMessage : error.message;
}
