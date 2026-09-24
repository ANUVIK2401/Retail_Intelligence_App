/**
 * Extension point for bringing other channels into a project.
 *
 * Mail and calendar are built in. Slack, WhatsApp, and other private
 * channels are an open question with the client (who owns the data, what
 * consent looks like), so there is deliberately no implementation here. A
 * source added later implements this interface and registers below; nothing
 * else in the Projects feature changes.
 */
export interface ProjectSource {
  readonly kind: string;
  /** Items visible to the owner, already permission-filtered by the source. */
  listItems(ownerId: string): Promise<ProjectSourceItem[]>;
}

export type ProjectSourceItem = {
  id: string;
  sourceKind: string;
  title: string;
  receivedAt: string;
  participantIds: string[];
};

/** Registered sources beyond mail and calendar. Empty until the client decides. */
export const PROJECT_SOURCES: readonly ProjectSource[] = [];
