/**
 * Every input this calculator takes — age, income, current savings — is encoded
 * in the query string so scenarios are shareable. Vercel Web Analytics records
 * query parameters by default, which would mean shipping each visitor's salary
 * and balance to a third party the moment they typed it.
 *
 * So we strip the search string entirely before any event leaves the browser.
 * Stripping wholesale rather than naming individual parameters is deliberate:
 * a new input added later is redacted automatically instead of silently
 * becoming the next leak.
 *
 * Nothing of analytical value is lost — the site is a single page, so the path
 * is identical on every visit and the query string carries only personal data.
 */
/**
 * Constrained only on `url`, with no index signature, so this stays assignable
 * to Vercel's `BeforeSend` type — its event is a union of plain interfaces and
 * would not satisfy a broader constraint.
 */
export function stripQuery<T extends { url: string }>(event: T): T {
  try {
    const url = new URL(event.url);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.toString() };
  } catch {
    // An unparseable URL is not worth guessing at — blank it rather than risk
    // forwarding something that still has a query string attached.
    return { ...event, url: '' };
  }
}
