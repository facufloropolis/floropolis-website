/**
 * Delivery date logic for Floropolis.
 *
 * Delivery days: Monday, Tuesday, Thursday, Friday
 * Order cutoff: 8pm EST (America/New_York)
 * Lead time: 5 calendar days
 *
 * Inventory layers:
 *   Layer 1 (T1) + Layer 2 (T2) = available 5 calendar days from now, next valid delivery day
 *   Layer 3 (T3/T4) = available 14 calendar days from now (10 days to source)
 *
 * The slider on /shop shows dates, not tier labels.
 */

const DELIVERY_DAYS = [1, 2, 4, 5]; // Mon=1, Tue=2, Thu=4, Fri=5

/** Get the next valid delivery day on or after `from`. */
function nextDeliveryDay(from: Date): Date {
  const d = new Date(from);
  for (let i = 0; i < 14; i++) {
    if (DELIVERY_DAYS.includes(d.getDay())) return d;
    d.setDate(d.getDate() + 1);
  }
  return d; // fallback
}

/** Get the earliest delivery date for a given tier. */
export function getEarliestDeliveryDate(tier: string): Date {
  const now = new Date();
  if (tier === "T1" || tier === "T2") {
    // Available 5 calendar days from now, then next valid delivery day
    const target = new Date(now);
    target.setDate(target.getDate() + 5);
    return nextDeliveryDay(target);
  }
  // T3, T4: available 14 calendar days from now
  const target = new Date(now);
  target.setDate(target.getDate() + 14);
  return nextDeliveryDay(target);
}

/** Format date for display: "Mon, Mar 10" */
export function formatDeliveryDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Format date as ISO string (YYYY-MM-DD) for form values */
export function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Get available delivery dates from a start date, for the next N weeks */
export function getDeliveryDates(fromDate: Date, weeks: number = 6): Date[] {
  const dates: Date[] = [];
  const d = new Date(fromDate);
  const end = new Date(fromDate);
  end.setDate(end.getDate() + weeks * 7);

  while (d <= end) {
    if (DELIVERY_DAYS.includes(d.getDay())) {
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** Check if a product is available by a specific date based on its tier */
export function isAvailableByDate(tier: string, targetDate: Date): boolean {
  const earliest = getEarliestDeliveryDate(tier);
  return targetDate >= earliest;
}

/** Check if a product can be delivered within a date range */
export function isAvailableInRange(tier: string, fromDate: Date, toDate: Date): boolean {
  const earliest = getEarliestDeliveryDate(tier);
  // Product can deliver if its earliest available date falls before the window closes
  return earliest <= toDate;
}

/** Get the minimum slider date (earliest possible delivery = T1/T2 date) */
export function getMinSliderDate(): Date {
  return getEarliestDeliveryDate("T1");
}

/** Get the max slider date (show up to 8 weeks out) */
export function getMaxSliderDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 56); // 8 weeks
  return d;
}

/** Human-friendly label for availability */
export function getAvailabilityLabel(tier: string): string {
  const date = getEarliestDeliveryDate(tier);
  if (tier === "T1" || tier === "T2") {
    return `Available from ${formatDeliveryDate(date)}`;
  }
  return `Available from ${formatDeliveryDate(date)} (pre-order)`;
}

/** Get all valid delivery dates for the slider range */
export function getSliderDeliveryDates(): Date[] {
  const min = getMinSliderDate();
  const max = getMaxSliderDate();
  return getDeliveryDates(min, 8).filter((d) => d <= max);
}

/** Parse current wall-clock time in America/New_York as a plain local Date. */
function getNowEST(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)!.value);
  return new Date(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
}

/**
 * Returns the next { orderBy, receiveBy } window.
 * orderBy = cutoff datetime in EST (delivery - 5 days at 8pm EST).
 * receiveBy = the delivery date (midnight = start of day).
 * Returns null only if no window found in 3 weeks (shouldn't happen).
 */
export function getNextOrderWindow(): { orderBy: Date; receiveBy: Date } | null {
  const now = getNowEST();
  for (let i = 0; i < 21; i++) {
    const delivery = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!DELIVERY_DAYS.includes(delivery.getDay())) continue;
    const cutoff = new Date(delivery.getFullYear(), delivery.getMonth(), delivery.getDate() - 5, 20, 0, 0);
    if (now <= cutoff) return { orderBy: cutoff, receiveBy: delivery };
  }
  return null;
}

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats a delivery window as urgency copy.
 * e.g. "Order by tonight 8pm EST · Arrives Mon May 19"
 *      "Order by Wed May 14 by 8pm EST · Arrives Mon May 19"
 */
export function formatOrderWindow(w: { orderBy: Date; receiveBy: Date }): string {
  const now = getNowEST();
  const ob = w.orderBy;
  const isToday =
    ob.getFullYear() === now.getFullYear() &&
    ob.getMonth() === now.getMonth() &&
    ob.getDate() === now.getDate();
  const orderByLabel = isToday
    ? "tonight by 8pm EST"
    : `${SHORT_DAY[ob.getDay()]} ${SHORT_MON[ob.getMonth()]} ${ob.getDate()} by 8pm EST`;
  const rb = w.receiveBy;
  const receiveByLabel = `${SHORT_DAY[rb.getDay()]} ${SHORT_MON[rb.getMonth()]} ${rb.getDate()}`;
  return `Order by ${orderByLabel} · Arrives ${receiveByLabel}`;
}
