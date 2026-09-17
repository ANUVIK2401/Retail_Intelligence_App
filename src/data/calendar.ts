import type { BusyBlock } from "@/core/contracts";

/**
 * Synthetic free/busy. Deliberately contains no meeting subjects: the mock
 * connector cannot leak a title because no title exists in the fixture.
 */

const DAY = 24 * 60 * 60 * 1000;

function slot(
  personId: string,
  dayOffset: number,
  startHour: number,
  endHour: number,
  status: BusyBlock["status"] = "busy",
): BusyBlock {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const day = new Date(base.getTime() + dayOffset * DAY);
  const start = new Date(day);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(day);
  end.setHours(endHour, 0, 0, 0);
  return { personId, start: start.toISOString(), end: end.toISOString(), status };
}

export const BUSY_BLOCKS: BusyBlock[] = [
  // CEO — heavily booked, with a protected strategy block each morning.
  slot("p_ceo", 1, 8, 9, "out_of_office"),
  slot("p_ceo", 1, 9, 11),
  slot("p_ceo", 1, 13, 14),
  slot("p_ceo", 1, 15, 17),
  slot("p_ceo", 2, 8, 9, "out_of_office"),
  slot("p_ceo", 2, 10, 12),
  slot("p_ceo", 2, 14, 15),
  slot("p_ceo", 3, 8, 9, "out_of_office"),
  slot("p_ceo", 3, 9, 10),
  slot("p_ceo", 3, 11, 12),
  slot("p_ceo", 3, 14, 16),
  slot("p_ceo", 4, 8, 9, "out_of_office"),
  slot("p_ceo", 4, 9, 12),
  slot("p_ceo", 4, 16, 18),

  // COO
  slot("p_coo", 1, 7, 12),
  slot("p_coo", 2, 9, 10),
  slot("p_coo", 2, 13, 15),
  slot("p_coo", 3, 8, 11),
  slot("p_coo", 4, 13, 14),

  // Director, requesting time with the CEO
  slot("p_dir_ops", 1, 9, 10),
  slot("p_dir_ops", 2, 11, 13),
  slot("p_dir_ops", 3, 9, 10, "tentative"),
  slot("p_dir_ops", 4, 14, 15),

  // Executive assistant
  slot("p_ea", 1, 7, 8),
  slot("p_ea", 2, 12, 13),
  slot("p_ea", 3, 15, 16),

  slot("p_cfo", 1, 10, 12),
  slot("p_cfo", 2, 9, 11),
  slot("p_cfo", 3, 13, 15),
  slot("p_vp_stores", 1, 8, 16),
  slot("p_vp_logistics", 2, 8, 10),
];

/** Protected blocks the assistant may never book over, by person. */
export const PROTECTED_BLOCKS: Record<string, { startHour: number; endHour: number; label: string }[]> = {
  p_ceo: [{ startHour: 8, endHour: 9, label: "Protected strategy hour" }],
};
