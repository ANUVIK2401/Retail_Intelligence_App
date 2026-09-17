import type { Insight } from "@/core/contracts";

/**
 * Approved-source stub for the Insights module. Three synthetic documents
 * stand in for the client's approved internal reports. Nothing is fetched
 * from the open web in the prototype.
 */

export type KnowledgeSource = {
  id: string;
  label: string;
  kind: "internal_report" | "market_data" | "competitor_watch";
  /** Functions permitted to retrieve from this source. */
  allowedFunctions: string[];
  excerpt: string;
};

export const SOURCES: KnowledgeSource[] = [
  {
    id: "src_dc_weekly",
    label: "DC Operations Weekly — week 37 (internal)",
    kind: "internal_report",
    allowedFunctions: ["logistics", "operations", "executive"],
    excerpt:
      "Ontario DC units per labor hour 142 (+4.1% MoM). Carrier exception rate 2.3%. Inbound container dwell up 1.4 days on the West Coast following the Long Beach labor action; two ocean carriers have added a congestion surcharge effective the 24th.",
  },
  {
    id: "src_comp_watch",
    label: "Competitor Watch Digest — specialty apparel (internal)",
    kind: "competitor_watch",
    allowedFunctions: ["marketing", "executive"],
    excerpt:
      "Two national specialty apparel competitors launched take-back and resale programs this quarter, both leading with circularity claims in paid social. Engagement on founder-voice posts is outperforming brand-account posts by roughly 3x in the category.",
  },
  {
    id: "src_traffic",
    label: "Mall Traffic and Comp Index — September (licensed)",
    kind: "market_data",
    allowedFunctions: ["operations", "finance", "executive"],
    excerpt:
      "Class A mall traffic +1.2% YoY in September; Class B/C -2.8%. Southwest region underperforms the national index by 2.0 points, consistent with weather-driven softness in the first three weeks of the month.",
  },
];

export const INSIGHTS: Insight[] = [
  {
    id: "i_logistics",
    function: "logistics",
    headline: "West Coast dwell time is the peak risk, not labor capacity",
    body: "Throughput per labor hour improved again in August, so the overtime request is buying schedule protection rather than fixing a productivity gap. The larger exposure is inbound container dwell, up 1.4 days, with two carriers adding congestion surcharges from the 24th. Worth asking whether some peak volume can be diverted to Grand Prairie before committing the full overtime line.",
    citations: [
      { sourceId: "src_dc_weekly", label: "DC Operations Weekly — week 37" },
    ],
    generatedAt: new Date().toISOString(),
  },
  {
    id: "i_marketing",
    function: "marketing",
    headline: "Founder-voice posting is outperforming brand accounts 3x in the category",
    body: "Two competitors are already running circularity campaigns this quarter, which narrows the novelty window for the denim program. Category data shows founder-voice posts outperforming brand-account posts by about 3x on engagement, which supports Sam's request to publish the launch under the CEO's own profile rather than the brand account.",
    citations: [
      { sourceId: "src_comp_watch", label: "Competitor Watch Digest" },
    ],
    generatedAt: new Date().toISOString(),
  },
  {
    id: "i_operations",
    function: "operations",
    headline: "Southwest softness tracks the market, not execution",
    body: "Southwest comps are trailing at -1.1%, but the licensed traffic index shows the region running 2.0 points below the national line on weather-driven softness. That points to a traffic problem rather than a store execution problem, and argues against a regional intervention this month.",
    citations: [{ sourceId: "src_traffic", label: "Mall Traffic and Comp Index" }],
    generatedAt: new Date().toISOString(),
  },
];

/* ------------------------------------------------------------------ */
/* Retrieval corpus (B8)                                               */
/* ------------------------------------------------------------------ */

/**
 * Longer synthetic documents, each scoped to the functions cleared to read it.
 * These are what the retrieval path in `core/services/insights.ts` chunks,
 * embeds, and ranks. `SOURCES` above remains the client-facing catalogue.
 *
 * The logistics and marketing documents deliberately share vocabulary
 * ("program", "launch", "quarter") so that a permission leak would show up as
 * a real ranking failure rather than being hidden by disjoint wording.
 */
export const CORPUS: KnowledgeSource[] = [
  ...SOURCES,
  {
    id: "src_dc_capacity",
    label: "Peak Capacity Memo — Ontario and Grand Prairie (internal)",
    kind: "internal_report",
    allowedFunctions: ["logistics", "operations", "executive"],
    excerpt:
      "Ontario DC is forecast to run at 96% of rated throughput during weeks 44 through 48, against 81% at Grand Prairie. Diverting roughly 14% of inbound peak volume to Grand Prairie would hold both sites under 90% and avoid an estimated 2,800 overtime hours. The constraint is not labor availability; it is inbound container dwell, which reached 4.1 days at the Port of Long Beach in week 36 against a 2.7-day baseline. Two ocean carriers filed congestion surcharges effective the 24th. The logistics recommendation is to pre-position peak inventory before week 42 rather than to fund the full overtime line.",
  },
  {
    id: "src_carrier_scorecard",
    label: "Carrier Scorecard — Q3 (internal)",
    kind: "internal_report",
    allowedFunctions: ["logistics", "executive"],
    excerpt:
      "Carrier exception rate across the national lane set is 2.3%, improved from 3.1% in Q2. Two regional carriers account for 61% of exceptions, concentrated in the Southwest lanes. On-time delivery to store is 94.6%. The recommended action is to reallocate roughly 18% of Southwest tender volume away from the two underperforming carriers at the next rate review rather than to renegotiate mid-contract.",
  },
  {
    id: "src_social_performance",
    label: "Social Channel Performance — trailing 90 days (internal)",
    kind: "internal_report",
    allowedFunctions: ["marketing", "executive"],
    excerpt:
      "Founder-voice posts published from an executive's personal profile outperform brand-account posts by roughly 3x on engagement rate and 2.2x on qualified profile visits. Long-form posts that open with a concrete failure outperform launch-announcement posts by a wide margin. Two national specialty apparel competitors launched circularity programs this quarter, both leading with recycled-content claims, which narrows the novelty window for any similar launch to roughly six weeks.",
  },
  {
    id: "src_brand_guidelines",
    label: "Executive Voice Guidelines (internal)",
    kind: "internal_report",
    allowedFunctions: ["marketing", "executive"],
    excerpt:
      "Executive posts are written in first person, open with a specific fact rather than a thesis, and state a number the company is accountable for. Percentage claims about recovery, recycled content, or emissions require substantiation on file before publication. Superlatives such as 'first', 'only', or 'best in the industry' are not used without a cited third-party source.",
  },
  {
    id: "src_finance_close",
    label: "Month-End Close Commentary — September (internal)",
    kind: "internal_report",
    allowedFunctions: ["finance", "executive"],
    excerpt:
      "Comparable store sales finished the month at -0.4% against a -0.9% plan. Gross margin expanded 40 basis points on lower markdown. Southwest region comps trail at -1.1%. Freight expense is running 60 basis points above plan, driven by congestion surcharges rather than by volume. Guidance is unchanged pending the Q4 peak result.",
  },
];
