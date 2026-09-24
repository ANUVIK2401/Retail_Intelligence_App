/**
 * Feature flags, read on the server from the environment and handed to the
 * client through /api/session. A flag hides a surface; it never switches off
 * policy or audit underneath it.
 */
export type Features = {
  /** The separate Approvals queue. Off until PacSun's executive workflows are understood (Sept 23 review). */
  approvals: boolean;
  /** Reading short assistant replies aloud with the browser's speech synthesis. */
  voiceReplies: boolean;
};

export function readFeatures(env: Readonly<Record<string, string | undefined>> = process.env): Features {
  return {
    approvals: enabled(env.FEATURE_APPROVALS),
    voiceReplies: enabled(env.FEATURE_VOICE_REPLIES),
  };
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes((value ?? "").trim().toLowerCase());
}
