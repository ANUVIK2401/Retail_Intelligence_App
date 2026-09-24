import type { Project } from "@/core/contracts";

/**
 * Synthetic projects for the demo executive. Each one links real fixture
 * records (emails, calendar events, people) so the Projects view shows a
 * populated alternative to the chronological inbox.
 */
const CREATED = "2026-09-01T16:00:00.000Z";

export const SEED_PROJECTS: Project[] = [
  {
    id: "pr_denim",
    ownerId: "p_ceo",
    name: "Denim circularity launch",
    description: "Take-back program announcement on the 29th, posted in Maya's own voice with Legal-reviewed claims.",
    color: "teal",
    type: "initiative",
    status: "active",
    createdAt: CREATED,
    memberIds: ["p_vp_brand", "p_cmo", "p_gc"],
    emailIds: ["e_publish"],
    eventIds: ["cal_ceo_denim"],
    workspaceIds: [],
    keywords: ["denim", "circularity", "take-back", "linkedin", "sustainab"],
  },
  {
    id: "pr_remodel",
    ownerId: "p_ceo",
    name: "West region remodel pilot",
    description: "Early results from the remodeled West stores before committing capital to phase two.",
    color: "amber",
    type: "initiative",
    status: "active",
    createdAt: CREATED,
    memberIds: ["p_dir_ops", "p_vp_stores", "p_coo"],
    // Casey's request is left unfiled on purpose: the inbox suggests this
    // project for it, and one tap files it.
    emailIds: [],
    eventIds: ["cal_ceo_store"],
    workspaceIds: [],
    keywords: ["remodel", "west region", "pilot", "phase two", "capital"],
  },
  {
    id: "pr_peak",
    ownerId: "p_ceo",
    name: "Peak season DC readiness",
    description: "Staffing, overtime, and carrier capacity at Ontario and Grand Prairie ahead of the November peak.",
    color: "indigo",
    type: "initiative",
    status: "active",
    createdAt: CREATED,
    memberIds: ["p_vp_logistics", "p_mgr_analytics", "p_cfo"],
    emailIds: ["e_approval"],
    eventIds: ["cal_cfo_forecast"],
    workspaceIds: [],
    keywords: ["dc ", "distribution center", "overtime", "peak", "carrier", "throughput"],
  },
  {
    id: "pr_staff",
    ownerId: "p_ceo",
    name: "Weekly leadership staff",
    description: "The recurring leadership meeting: operating review, comp sales, and the decisions it owes.",
    color: "slate",
    type: "recurring",
    status: "active",
    createdAt: CREATED,
    memberIds: ["p_coo", "p_cfo", "p_cdio", "p_cmo", "p_gc"],
    emailIds: ["e_report", "e_schedule_direct"],
    eventIds: ["cal_ceo_leadership"],
    workspaceIds: [],
    keywords: ["leadership", "staff meeting", "comp sales", "digest", "operating review", "1:1"],
  },
];
