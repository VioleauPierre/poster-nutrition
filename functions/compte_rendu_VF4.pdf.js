const parisDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const incrementDailyTotal = `
  INSERT INTO pdf_daily_opens (day, opens)
  VALUES (?1, 1)
  ON CONFLICT(day) DO UPDATE SET opens = opens + 1
`;

export async function onRequestGet({ request, next, env, waitUntil }) {
  const response = await next();
  const contentType = response.headers.get("Content-Type")?.split(";")[0].trim();
  const purpose = request.headers.get("Sec-Purpose") ?? request.headers.get("Purpose") ?? "";

  if (
    response.status === 200 &&
    contentType === "application/pdf" &&
    !request.headers.has("Range") &&
    !/prefetch|prerender/i.test(purpose) &&
    env.PDF_STATS
  ) {
    const day = parisDate.format(new Date());
    waitUntil(
      Promise.resolve()
        .then(() => env.PDF_STATS.prepare(incrementDailyTotal).bind(day).run())
        .catch(() => {
          // A counter failure must not interrupt access to the PDF.
        }),
    );
  }

  return response;
}
