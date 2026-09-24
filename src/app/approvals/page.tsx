import { redirect } from "next/navigation";
import { readFeatures } from "@/config/features";
import { ApprovalsView } from "./ApprovalsView";

export const dynamic = "force-dynamic";

/**
 * The separate Approvals queue sits behind FEATURE_APPROVALS (default off)
 * until PacSun's executive workflows are understood. With it off, the
 * confirmation still happens inline where the action is (Book, Send), and
 * policy and audit run underneath exactly as before.
 */
export default function ApprovalsPage() {
  if (!readFeatures().approvals) redirect("/");
  return <ApprovalsView />;
}
