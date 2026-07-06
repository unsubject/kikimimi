/**
 * Timezone helpers. The daily drop is defined in the learner's local time
 * (default 07:00 America/New_York per spec §3); Cloudflare cron only speaks
 * UTC and runs hourly, so the handler converts to the learner's zone and fires
 * on the first tick at/after the configured drop hour (see isDropDue).
 */

export function hourInZone(date: Date, tz: string): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(s) % 24; // Intl renders midnight as "24" in some runtimes
}

/** Calendar day (YYYY-MM-DD) in the given zone — the cost governor's day boundary. */
export function dayInZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Calendar month (YYYY-MM) in the given zone — the monthly breaker's boundary. */
export function monthInZone(date: Date, tz: string): string {
  return dayInZone(date, tz).slice(0, 7);
}

/**
 * True when the local time in `tz` is at or past the configured drop hour
 * ("07:00" → hour 7). Paired with a once-per-day delivery guard and an hourly
 * cron, this delivers exactly once, at the first tick on/after the drop hour —
 * so any drop_time works, not only the two hours the old fixed cron covered.
 */
export function isDropDue(date: Date, tz: string, dropTime: string): boolean {
  const dropHour = Number(dropTime.split(":")[0] ?? "7");
  return hourInZone(date, tz) >= dropHour;
}
