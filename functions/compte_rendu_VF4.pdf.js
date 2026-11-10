/**
 * Cloudflare Pages Function for the existing PDF at /compte_rendu_VF4.pdf.
 *
 * Serves the existing static asset (no replacement, redirect, or URL change).
 * Records only a daily aggregate in D1, with no visitor identifiers.
 *
 * SAFETY: writes are OFF unless PDF_COUNTER_ENABLED is exactly "true".
 * This matters because Preview and Production currently point to the same D1.
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  // Always serve the real Pages asset with its original status, body and headers.
  // In particular, forward Range requests for PDF viewers without altering them.
  const response = await env.ASSETS.fetch(request);

  if (env.PDF_COUNTER_ENABLED !== 'true' || !env.DB) return response;

  // Count only successful full GETs or initial ranges starting at byte 0.
  // Cloudflare Pages may respond 200 (not 206) even to a Range request.
  // Never count HEAD, conditional 304s, missing assets or later ranges.
  const range = request.headers.get('Range');
  const initialRange = range !== null && /^bytes=0-(?:\d+)?$/i.test(range.trim());
  const eligible = (response.status === 200 && (range === null || initialRange)) ||
    (response.status === 206 && initialRange);

  if (eligible) {
    const day = new Date().toISOString().slice(0, 10); // UTC
    try {
      const task = env.DB.prepare(
        'INSERT INTO pdf_daily_opens (day, opens) VALUES (?, 1) ' +
        'ON CONFLICT(day) DO UPDATE SET opens = opens + 1'
      ).bind(day).run();

      context.waitUntil(Promise.resolve(task).catch(() => {
        // Never log request headers, addresses, paths with query strings, or PII.
        console.error('PDF counter: failed to update daily aggregate');
      }));
    } catch (_) {
      // A broken/missing counter must never prevent PDF access.
      console.error('PDF counter: could not start aggregate update');
    }
  }

  return response;
}
