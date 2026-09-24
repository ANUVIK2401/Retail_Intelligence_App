import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { ProjectLinkSchema } from "@/core/contracts";
import { readJsonBody } from "@/core/deployment/request";
import { actorFromRequest } from "@/core/session";
import { linkToProject, ProjectError, projectDetail } from "@/core/services/projects";

type Params = { params: Promise<{ id: string }> };

async function handleGET(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    return NextResponse.json(await projectDetail(actorFromRequest(req), id));
  } catch (error) {
    if (error instanceof ProjectError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** Add to project / remove from project, including accepting a suggestion. */
async function handlePATCH(req: Request, { params }: Params) {
  const { id } = await params;
  let body: unknown;
  try { body = await readJsonBody(req, 2048); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = ProjectLinkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid project change." }, { status: 400 });
  try {
    return NextResponse.json({ project: await linkToProject(actorFromRequest(req), id, parsed.data) });
  } catch (error) {
    if (error instanceof ProjectError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const GET = withDemoState(handleGET);
export const PATCH = withDemoState(handlePATCH);
