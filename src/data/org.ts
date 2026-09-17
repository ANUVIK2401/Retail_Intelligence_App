import type { Delegation, Person } from "@/core/contracts";

/**
 * Synthetic organization. No real executive, customer, or company data
 * appears anywhere in this repository.
 *
 * Shape mirrors a mid-size specialty retailer so the demo scenarios are
 * recognizable to the client without using their data.
 */

export const ORG_NAME = "Northline Retail Group";

export const PEOPLE: Person[] = [
  {
    id: "p_ceo",
    name: "Maya Hollis",
    title: "Chief Executive Officer",
    email: "maya.hollis@northline.example",
    level: 1,
    managerId: null,
    function: "executive",
    roles: ["executive"],
    reviewerDomains: [],
    assistantId: "p_ea",
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 8, endHour: 18 },
  },
  {
    id: "p_ea",
    name: "Grace Whitfield",
    title: "Executive Assistant to the CEO",
    email: "grace.whitfield@northline.example",
    level: 3,
    managerId: "p_ceo",
    function: "executive",
    roles: ["executive_assistant"],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 7, endHour: 17 },
  },
  {
    id: "p_coo",
    name: "Ray Alvarez",
    title: "Chief Operating Officer",
    email: "ray.alvarez@northline.example",
    level: 2,
    managerId: "p_ceo",
    function: "operations",
    roles: ["executive"],
    reviewerDomains: ["crisis"],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 7, endHour: 18 },
  },
  {
    id: "p_cfo",
    name: "Priya Raman",
    title: "Chief Financial Officer",
    email: "priya.raman@northline.example",
    level: 2,
    managerId: "p_ceo",
    function: "finance",
    roles: ["executive", "reviewer"],
    reviewerDomains: ["finance"],
    assistantId: null,
    timezone: "America/New_York",
    workingHours: { startHour: 8, endHour: 18 },
  },
  {
    id: "p_cdio",
    name: "Dana Okonkwo",
    title: "Chief Digital and Information Officer",
    email: "dana.okonkwo@northline.example",
    level: 2,
    managerId: "p_ceo",
    function: "technology",
    roles: ["executive", "administrator"],
    reviewerDomains: ["security"],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 8, endHour: 18 },
  },
  {
    id: "p_cmo",
    name: "Tomas Lund",
    title: "Chief Marketing Officer",
    email: "tomas.lund@northline.example",
    level: 2,
    managerId: "p_ceo",
    function: "marketing",
    roles: ["executive"],
    reviewerDomains: ["communications"],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 9, endHour: 19 },
  },
  {
    id: "p_gc",
    name: "Marcus Field",
    title: "General Counsel",
    email: "marcus.field@northline.example",
    level: 2,
    managerId: "p_ceo",
    function: "legal",
    roles: ["executive", "reviewer"],
    reviewerDomains: ["legal", "crisis"],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 8, endHour: 18 },
  },
  {
    id: "p_vp_stores",
    name: "Nina Serrano",
    title: "Vice President, Store Operations",
    email: "nina.serrano@northline.example",
    level: 3,
    managerId: "p_coo",
    function: "operations",
    roles: ["executive"],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 7, endHour: 18 },
  },
  {
    id: "p_vp_logistics",
    name: "Jordan Pike",
    title: "Vice President, Logistics",
    email: "jordan.pike@northline.example",
    level: 3,
    managerId: "p_coo",
    function: "logistics",
    roles: ["executive"],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/Chicago",
    workingHours: { startHour: 7, endHour: 17 },
  },
  {
    id: "p_vp_brand",
    name: "Sam Rivera",
    title: "Vice President, Brand and Social",
    email: "sam.rivera@northline.example",
    level: 3,
    managerId: "p_cmo",
    function: "marketing",
    roles: ["executive"],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 9, endHour: 18 },
  },
  {
    id: "p_dir_ops",
    name: "Casey Wu",
    title: "Director, Store Operations West",
    email: "casey.wu@northline.example",
    level: 4,
    managerId: "p_vp_stores",
    function: "operations",
    roles: [],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/Los_Angeles",
    workingHours: { startHour: 8, endHour: 18 },
  },
  {
    id: "p_mgr_analytics",
    name: "Ellie Novak",
    title: "Manager, Logistics Analytics",
    email: "ellie.novak@northline.example",
    level: 5,
    managerId: "p_vp_logistics",
    function: "logistics",
    roles: [],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/Chicago",
    workingHours: { startHour: 8, endHour: 17 },
  },
  {
    id: "p_auditor",
    name: "Lena Marsh",
    title: "Internal Audit Lead",
    email: "lena.marsh@northline.example",
    level: 3,
    managerId: "p_cfo",
    function: "finance",
    roles: ["auditor"],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/New_York",
    workingHours: { startHour: 8, endHour: 17 },
  },
  {
    id: "p_ext_banker",
    name: "Howard Teague",
    title: "Managing Director, Clearwater Partners",
    email: "h.teague@clearwater.example",
    level: 99,
    managerId: null,
    function: "external",
    roles: [],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/New_York",
    workingHours: { startHour: 8, endHour: 18 },
  },
  {
    id: "p_ext_vendor",
    name: "RetailEdge Conferences",
    title: "Marketing",
    email: "events@retailedge.example",
    level: 99,
    managerId: null,
    function: "external",
    roles: [],
    reviewerDomains: [],
    assistantId: null,
    timezone: "America/New_York",
    workingHours: { startHour: 9, endHour: 17 },
  },
];

export const DELEGATIONS: Delegation[] = [
  {
    id: "d_ea_ceo",
    executiveId: "p_ceo",
    delegateId: "p_ea",
    allowedActions: [
      "calendar.read_freebusy",
      "calendar.propose",
      "calendar.create_event",
      "email.draft",
    ],
    maxRisk: "low",
  },
];

/**
 * Named allowlist for restricted topics. Membership is explicit; it is never
 * derived from role, seniority, or model output.
 */
export const RESTRICTED_ACCESS: Record<string, string[]> = {
  confidential_strategy: ["p_ceo", "p_cfo", "p_gc"],
};

export function personById(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}

export function personByEmail(email: string): Person | undefined {
  return PEOPLE.find((p) => p.email.toLowerCase() === email.toLowerCase());
}

/** Chain of manager ids from a person up to the CEO. */
export function managerChain(id: string): string[] {
  const chain: string[] = [];
  let current = personById(id);
  while (current?.managerId) {
    chain.push(current.managerId);
    current = personById(current.managerId);
  }
  return chain;
}

export function isDirectReport(requesterId: string, targetId: string): boolean {
  return personById(requesterId)?.managerId === targetId;
}

export function levelDifference(requesterId: string, targetId: string): number {
  const a = personById(requesterId);
  const b = personById(targetId);
  if (!a || !b) return 99;
  return a.level - b.level;
}
