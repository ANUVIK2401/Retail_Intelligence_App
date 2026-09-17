import type { BusyBlock, EmailMessage, Person } from "@/core/contracts";

/**
 * Connector interfaces.
 *
 * Feature modules depend only on these. The Microsoft Graph implementations
 * drop in behind them once a test tenant and delegated consent exist; nothing
 * above this line changes.
 *
 * Every write method takes an `approvalId`. A connector that cannot name the
 * approval that authorized it must not be able to write. This is the last
 * gate before an action leaves the system.
 */

export interface MailConnector {
  readonly kind: string;
  listMessages(mailboxOwnerId: string): Promise<EmailMessage[]>;
  getMessage(id: string): Promise<EmailMessage | null>;
  createReplyDraft(input: {
    messageId: string;
    body: string;
    approvalId: string;
  }): Promise<{ draftId: string; externalRef: string }>;
  sendDraft(input: { draftId: string; approvalId: string }): Promise<{ sentAt: string }>;
}

export interface CalendarConnector {
  readonly kind: string;
  /**
   * Free/busy only. The return type has no subject field, so a leak would
   * require changing the contract and failing type-check.
   */
  getSchedule(input: {
    personIds: string[];
    from: string;
    to: string;
  }): Promise<BusyBlock[]>;
  createEvent(input: {
    ownerId: string;
    attendeeIds: string[];
    start: string;
    end: string;
    subject: string;
    approvalId: string;
  }): Promise<{ eventId: string }>;
}

export interface DirectoryConnector {
  readonly kind: string;
  listPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | null>;
}
