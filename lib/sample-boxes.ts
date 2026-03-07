/**
 * Sample boxes available this week — same logic as sample-box page.
 * Resets weekly (Monday 9am EST implied); used by TopBanner and sample-box form.
 */
export function getSampleBoxesAvailable(): number {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const spotsMap: Record<number, number> = {
    0: 0,  // Sunday - gone, resets Monday
    1: 10, // Monday - fresh batch
    2: 7,  // Tuesday
    3: 5,  // Wednesday
    4: 4,  // Thursday
    5: 3,  // Friday
    6: 2,  // Saturday - last few
  };
  return spotsMap[day] ?? 0;
}
