/**
 * Newline-delimited JSON over a fetch body: one value per line, yielded as each
 * line arrives rather than once the response ends. Shared by the ML routes,
 * which relay the service's progress stream, and the browser, which reads it.
 */

export const NDJSON = 'application/x-ndjson';

export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // `stream` holds back a multi-byte character split across chunks.
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line);
      }
    }
    buffered += decoder.decode();
    if (buffered.trim()) yield JSON.parse(buffered);
  } finally {
    // Stopping early (a consumer that returns on the first result) must not
    // leave the connection open.
    await reader.cancel().catch(() => {});
  }
}
