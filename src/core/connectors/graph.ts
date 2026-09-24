import type { CalendarConnector, DirectoryConnector, MailConnector } from "@/core/connectors";
import type { BusyBlock, EmailMessage, Person } from "@/core/contracts";

/**
 * Microsoft Graph adapters: a stub, on purpose.
 *
 * The prototype does not call Graph (see CLAUDE.md, "What is deliberately not
 * built"). These classes exist so the seam is real: they implement the same
 * interfaces as the synthetic connectors, and each method names the Graph
 * call and delegated scope it would use. Selecting DATA_SOURCE=graph fails
 * loudly with this message instead of silently falling back to fixtures.
 */
export class ConnectorNotConfiguredError extends Error {
  constructor(call: string) {
    super(`Microsoft Graph is not connected in this prototype (${call}). See docs/architecture.md for the integration plan.`);
    this.name = "ConnectorNotConfiguredError";
  }
}

export class GraphMailConnector implements MailConnector {
  readonly kind = "graph";
  /** GET /users/{id}/messages?$select=... (Mail.Read, delegated) */
  async listMessages(_mailboxOwnerId: string): Promise<EmailMessage[]> { throw new ConnectorNotConfiguredError("GET /messages"); }
  /** GET /users/{id}/messages/{messageId} (Mail.Read, delegated) */
  async getMessage(_id: string): Promise<EmailMessage | null> { throw new ConnectorNotConfiguredError("GET /messages/{id}"); }
  /** POST /messages/{id}/createReply (Mail.ReadWrite, delegated). Requires an approval id, like the synthetic connector. */
  async createReplyDraft(input: { messageId: string; body: string; approvalId: string }): Promise<{ draftId: string; externalRef: string }> {
    if (!input.approvalId) throw new Error("Refused: a draft cannot be created without an approval id.");
    throw new ConnectorNotConfiguredError("POST /messages/{id}/createReply");
  }
  /** POST /messages/{draftId}/send (Mail.Send, delegated). Requires an approval id. */
  async sendDraft(input: { draftId: string; approvalId: string }): Promise<{ sentAt: string }> {
    if (!input.approvalId) throw new Error("Refused: a message cannot be sent without an approval id.");
    throw new ConnectorNotConfiguredError("POST /messages/{id}/send");
  }
}

export class GraphCalendarConnector implements CalendarConnector {
  readonly kind = "graph";
  /**
   * POST /users/{id}/calendar/getSchedule (Calendars.Read.Shared, delegated).
   * Maps scheduleItems[].status (busy, tentative, oof) to BusyBlock and never
   * reads subject or location, so the free/busy invariant holds on Graph too.
   */
  async getSchedule(_input: { personIds: string[]; from: string; to: string }): Promise<BusyBlock[]> {
    throw new ConnectorNotConfiguredError("POST /calendar/getSchedule");
  }
  /** POST /users/{ownerId}/events (Calendars.ReadWrite, delegated). Requires an approval or policy grant. */
  async createEvent(input: Parameters<CalendarConnector["createEvent"]>[0]): Promise<{ eventId: string }> {
    if (Boolean(input.approvalId) === Boolean(input.policyGrantId)) throw new Error("Refused: an event needs exactly one approval or policy grant.");
    throw new ConnectorNotConfiguredError("POST /events");
  }
}

export class GraphDirectoryConnector implements DirectoryConnector {
  readonly kind = "graph";
  /** GET /users?$select=displayName,jobTitle,mail,mailboxSettings (User.ReadBasic.All, delegated) */
  async listPeople(): Promise<Person[]> { throw new ConnectorNotConfiguredError("GET /users"); }
  async getPerson(_id: string): Promise<Person | null> { throw new ConnectorNotConfiguredError("GET /users/{id}"); }
}
