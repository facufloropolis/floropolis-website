/**
 * Sample boxes available this week — same logic as sample-box page.
 * Resets weekly (Monday 9am EST implied); used by TopBanner and sample-box form.
 */
export function getSampleBoxesAvailable(): number {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const spotsMap: Record<number, number> = {
    0: 0,  // Sunday - none available
    1: 8,  // Monday - 8 spots
    2: 8,  // Tuesday - 8 spots
    3: 5,  // Wednesday - 5 spots
    4: 5,  // Thursday - 5 spots
    5: 2,  // Friday - 2 spots
    6: 0,  // Saturday - none available
  };
  return spotsMap[day] ?? 0;
}
