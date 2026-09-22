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
    const fixture = BUSY_BLOCKS.filter(
      (b) =>
        input.personIds.includes(b.personId) &&
        Date.parse(b.end) > Date.parse(input.from) &&
        Date.parse(b.start) < Date.parse(input.to),
    );
    const booked: BusyBlock[] = [...store.mockEvents.values()].flatMap((event) =>
      [...new Set([event.ownerId, ...(event.attendeeIds ?? [])])]
        .filter((personId) => input.personIds.includes(personId) &&
          Date.parse(event.end) > Date.parse(input.from) && Date.parse(event.start) < Date.parse(input.to))
        .map((personId) => ({ personId, start: event.start, end: event.end, status: "busy" as const })),
    );
    return [...fixture, ...booked];
  }

  async createEvent(input: {
    ownerId: string;
    attendeeIds: string[];
    start: string;
    end: string;
    subject: string;
    sensitivity: "normal" | "confidential";
  } & ({ approvalId: string; policyGrantId?: never } | { approvalId?: never; policyGrantId: string })): Promise<{ eventId: string }> {
    if (Boolean(input.approvalId) === Boolean(input.policyGrantId)) {
      throw new Error("Refused: an event needs exactly one approval or policy grant.");
    }
    const start = Date.parse(input.start);
    const end = Date.parse(input.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new Error("Refused: event time range is invalid.");
    }
    const participants = new Set([input.ownerId, ...input.attendeeIds]);
    const overlaps = [...store.mockEvents.values()].some((event) =>
      Date.parse(event.start) < end && Date.parse(event.end) > start &&
      [event.ownerId, ...(event.attendeeIds ?? [])].some((personId) => participants.has(personId)));
    if (overlaps) throw new Error("A participant is already booked at that time.");
    const eventId = `ev_${store.mockEvents.size + 1}`;
    store.mockEvents.set(eventId, {
      eventId,
      ownerId: input.ownerId,
      attendeeIds: [...input.attendeeIds],
      start: input.start,
      end: input.end,
      subject: input.subject,
      sensitivity: input.sensitivity,
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
