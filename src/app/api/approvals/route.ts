import { NextResponse } from "next/server";
import { listApprovals } from "@/core/store";

export async function GET() {
  return NextResponse.json({ approvals: listApprovals() });
}
