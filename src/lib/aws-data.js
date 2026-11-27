import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ maxAttempts: 1 });
// Only server-built PostgREST requests reach this IAM-only function. Preserve
// PostgREST's status, range/count, conflict and null-body response semantics.
export async function dataFetch(input, init) {
  const url = new URL(input);
  if (url.origin !== 'https://bart-site-data.invalid' || !url.pathname.startsWith('/rest/v1/')) throw Error('Unexpected data destination');
  const headers = Object.fromEntries(new Headers(init.headers));
  const method = init.method || 'GET';
  const event = {
    version: '2.0', routeKey: '$default', rawPath: url.pathname, rawQueryString: url.search.slice(1),
    headers, body: init.body || undefined, isBase64Encoded: false,
    requestContext: { stage: '$default', domainName: 'bart-site-data.invalid', requestId: crypto.randomUUID(), timeEpoch: Date.now(), http: { method, path: url.pathname, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'bart-site-web' } },
  };
  const result = await lambda.send(new InvokeCommand({
    FunctionName: 'bart-site-data', Payload: Buffer.from(JSON.stringify(event)),
  }), { abortSignal: init.signal ?? AbortSignal.timeout(60000) });
  if (result.FunctionError || !result.Payload) throw Error('Private data service unavailable');
  const reply = JSON.parse(Buffer.from(result.Payload).toString('utf8'));
  const body = reply.isBase64Encoded ? Buffer.from(reply.body || '', 'base64') : reply.body;
  return new Response(method === 'HEAD' || [204, 205, 304].includes(reply.statusCode) ? null : body, {
    status: reply.statusCode, headers: reply.headers,
  });
}
