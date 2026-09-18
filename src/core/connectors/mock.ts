import { store } from "@/core/store";
import type {
  CalendarConnector,
  DirectoryConnector,
  MailConnector,
} from "@/core/connectors";
import type { BusyBlock, EmailMessage, Person } from "@/core/contracts";
import { BUSY_BLOCKS } from "@/data/calendar";
import { EMAILS, emailById } from "@/data/emails";
import { PEOPLE, personById } from "@/data/org";

/**
 * Mock connectors backed by synthetic fixtures.
 *
 * These are what the demo runs on. They also serve as the reference
 * implementation the Microsoft Graph adapters must match behaviorally, and
 * they are what the adversarial tests run against.
 */

/** Strips markup and neutralizes anything that looks like a fence marker. */
export function sanitizeBody(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/​|‌|‍|﻿/g, "")
    .trim();
}

export class MockMailConnector implements MailConnector {
  readonly kind = "mock";


  async listMessages(mailboxOwnerId: string): Promise<EmailMessage[]> {
    return EMAILS.filter((e) => e.mailboxOwnerId === mailboxOwnerId).map((e) => ({
      ...e,
      body: sanitizeBody(e.body),
    }));
  }

  async getMessage(id: string): Promise<EmailMessage | null> {
    const found = emailById(id);
    return found ? { ...found, body: sanitizeBody(found.body) } : null;
  }

  async createReplyDraft(input: {
    messageId: string;
    body: string;
    approvalId: string;
  }): Promise<{ draftId: string; externalRef: string }> {
    if (!input.approvalId) {
      throw new Error("Refused: a draft cannot be created without an approval id.");
    }
    const draftId = `dr_${input.messageId}_${store.mockDrafts.size + 1}`;
    store.mockDrafts.set(draftId, { messageId: input.messageId, body: input.body });
    return { draftId, externalRef: `AAMkAGI2-DRAFT-${store.mockDrafts.size}` };
  }

  async sendDraft(input: { draftId: string; approvalId: string }): Promise<{ sentAt: string }> {
    if (!input.approvalId) {
      throw new Error("Refused: a message cannot be sent without an approval id.");
    }
    const draft = store.mockDrafts.get(input.draftId);
    if (!draft) throw new Error("Unknown draft.");
    const sentAt = new Date().toISOString();
    store.mockDrafts.set(input.draftId, { ...draft, sentAt });
    return { sentAt };
  }
}

export class MockCalendarConnector implements CalendarConnector {
  readonly kind = "mock";
  async getSchedule(input: {
    personIds: string[];
    from: string;
    to: string;
  }): Promise<BusyBlock[]> {
    // Returns availability only. No subject is read from the fixture because
    // the fixture has none.
    return BUSY_BLOCKS.filter(
      (b) =>
        input.personIds.includes(b.personId) &&
        b.end > input.from &&
        b.start < input.to,
    );
  }

  async createEvent(input: {
    ownerId: string;
    attendeeIds: string[];
    start: string;
    end: string;
    subject: string;
    approvalId: string;
  }): Promise<{ eventId: string }> {
    if (!input.approvalId) {
      throw new Error("Refused: an event cannot be created without an approval id.");
    }
    const eventId = `ev_${store.mockEvents.size + 1}`;
    store.mockEvents.set(eventId, {
      eventId,
      ownerId: input.ownerId,
      start: input.start,
      end: input.end,
      subject: input.subject,
    });
    return { eventId };
  }
}

export class MockDirectoryConnector implements DirectoryConnector {
  readonly kind = "mock";
  async listPeople(): Promise<Person[]> {
    return PEOPLE;
  }
  async getPerson(id: string): Promise<Person | null> {
    return personById(id) ?? null;
  }
}
