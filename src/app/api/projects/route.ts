import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/core/deployment/request";
import { actorFromRequest } from "@/core/session";
import { createProject, listProjects, ProjectError } from "@/core/services/projects";

async function handleGET(req: Request) {
  return NextResponse.json({ projects: listProjects(actorFromRequest(req)) });
}

async function handlePOST(req: Request) {
  const actor = actorFromRequest(req);
  let body: unknown;
  try { body = await readJsonBody(req, 4096); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  try {
    return NextResponse.json({ project: createProject(actor, body) }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const GET = withDemoState(handleGET);
export const POST = withDemoState(handlePOST);
