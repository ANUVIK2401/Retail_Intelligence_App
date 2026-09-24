import type { ProjectLink } from "@/core/contracts";

/** "Add to project" / "Remove from project" from any page. Resolves true on success. */
export async function changeProjectLink(projectId: string, link: ProjectLink): Promise<boolean> {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(link),
    });
    // Read the body so the connection is released even when the caller only needs ok.
    await response.json().catch(() => null);
    return response.ok;
  } catch {
    return false;
  }
}
