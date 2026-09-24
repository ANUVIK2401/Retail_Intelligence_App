/**
 * Product naming lives here and nowhere else. The September 23 review asked
 * for a calm assistant rather than the earlier militaristic name; changing it again
 * is a one-line edit to this file.
 */
export const PRODUCT = {
  /** Company the synthetic demo is built around. */
  org: "PacSun",
  /** Full product name for titles, sign-in, and the manifest. */
  name: "PacSun Executive Assistant",
  /** Name without the company, for the sidebar brand block. */
  title: "Executive Assistant",
  /** Short form used in UI copy ("Ask the Assistant"). */
  shortName: "Assistant",
  description:
    "A calm executive assistant prototype. The AI analyzes and proposes; deterministic policy and a human confirmation control every consequential action.",
} as const;
