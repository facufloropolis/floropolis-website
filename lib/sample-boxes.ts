/**
 * Returns -1 to indicate no scarcity counter should be shown.
 * Previously used a fake day-of-week counter which was misleading to visitors.
 * TODO: Connect to real sample box inventory when tracking is available.
 */
export function getSampleBoxesAvailable(): number {
  return -1;
}
