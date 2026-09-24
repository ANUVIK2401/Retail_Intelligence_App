# Demo script: PacSun Executive Assistant

About eight minutes. Synthetic data throughout. The story: an executive asks in
plain words, the assistant does the legwork, and nothing consequential happens
until the executive confirms.

## Before you present

Local:

```bash
npm install
AUTH_MODE=demo npm run dev        # opens as Maya Hollis, CEO
npm run e2e                       # the script below, automated (29 checks)
```

Deployed: sign in at https://retailintelligencecenter.vercel.app with a Google
account mapped to `p_ceo`, and confirm `/api/health` shows `"status":"ok"`.
Use Chrome or Safari for voice. Allow the microphone once before the meeting,
not during it.

Tip: dates are relative to today. Rehearse on the day; the times offered will
differ from rehearsal to rehearsal, which is expected.

## 1. Sign in and land on the chat (30 seconds)

1. Sign in. You land on the chat: a greeting for Maya and four suggestions.
2. Point at the left navigation: Chat, Inbox, Calendar, Projects, Notes, Posts,
   Insights, People, and Settings tucked at the bottom.
3. Point at the **Today** panel on the right: what needs attention, what can
   wait, what is coming up, and the daily brief. Close and reopen it with
   **Today**.

Say: "Chat is the front door. Everything else is one click away, not a wall of
dashboards."

## 2. Schedule from a sentence (2 minutes, the main event)

1. Tap **Find time with Ray and Priya** (or type "Find 30 minutes next week
   with Ray and Priya").
2. Four times come back, each with the day, the time in Maya's zone, and
   "2:00 PM ET for Priya" because Priya is in New York.
3. Tap one. The confirmation card opens: edit the title to "Q4 planning sync",
   check who is invited, press **Book**.
4. A **Booked** card appears. Open the **Today** panel: it is under Coming up.

Say: "It checked three calendars in two timezones, avoided Maya's protected
strategy hour, and booked only when she pressed Book."

5. Type "Actually make it 45 and add Nina". New options arrive, avoiding the
   meeting just booked, with "Updated: 45 minutes, adding Nina" at the top.
6. Optional: "anything on Wednesday instead?" narrows to Wednesday of the same
   week. If nothing fits, the assistant offers a shorter meeting, the closest
   time with one conflict (naming who), or looking further ahead.
7. Optional ambiguity: "Find time with the VP next week" asks which vice
   president, with one-tap answers.

## 3. Say it instead of typing it (45 seconds)

1. Tap the mic. Say "Find thirty minutes next week with Ray and Priya".
2. The words appear live in the box. Tick **Send after speaking** to skip the
   extra tap.

Say: "The browser's own speech service does the transcription. No audio reaches
our app."

## 4. What needs me? (1.5 minutes)

1. Tap **New chat**, then **What emails need my attention?**
2. Email cards come back, most serious first. The store fire is high risk: Reply
   and Quick reply are disabled with "respond personally".
3. On Ray's "Move our Thursday 1:1?", press **Quick reply**, pick **Got it**,
   press **Send**. "Sent. It is in your Sent folder and the audit history."
4. Open **Inbox** (on a phone if you have one). Filters: Needs me, Can wait,
   Snoozed, All. Swipe a message left for **Later** and choose **Tomorrow
   morning**; it moves to Snoozed. Swipe right for a quick reply. On a laptop,
   j/k move and f/q/l act.
5. On Ellie's overtime request, send a quick reply: it says "Waiting on: Finance
   reviewer releases". A finance decision still needs finance.

## 5. Projects (1 minute)

1. Open **Projects**: Denim circularity launch, West region remodel pilot, Peak
   season DC readiness, Weekly leadership staff.
2. Open **West region remodel pilot**: Overview, Emails, Meetings, People, Notes.
3. Press **Schedule a check-in**: the chat opens and finds time with the
   remodel team.
4. In **Inbox**, find Casey's "Request: 30 minutes on West region remodel
   pilot". It shows "Suggested: West region remodel pilot" (Casey is on the
   project and the subject names it). Tap **Add**; nothing is filed silently.
   Then turn on **Group by project**.
5. In chat: "What's pending on the denim launch?" returns the project card.

## 6. The rest, quickly (1 minute)

People (org hierarchy, kept by request), Notes (private brainstorming; only
explicit saves become memory), Posts (LinkedIn drafts checked, reviewed,
exported, never posted), Insights (answers only from approved, permitted
sources).

## Known limitations

- All data is synthetic. Google sign-in does not grant Gmail, Outlook, or
  Calendar access, and nothing is sent or booked outside the demo.
- Voice needs Chrome, Edge, or Safari. Firefox shows an explanation instead.
- Times are computed from a synthetic week relative to today, so options vary
  by day. On a Friday afternoon, "Wednesday instead" may have no shared time
  and the assistant offers alternatives instead.
- The deterministic parser handles common phrasing (names, titles like "the
  CFO", durations, "next week", "before Friday 3pm", morning/afternoon). A
  live model can be switched on for extraction, but every name still has to
  match the directory.
- The relational schema in `db/migrations` is migrated, seeded, and tested;
  the running app still keeps working state in one session row per member.
- Approvals are hidden by default (`FEATURE_APPROVALS=false`). Policy and audit
  still run.

## Three questions for the reviewer

1. **Approvals: keep or cut?** Today confirmation happens inline and anything
   needing a second person waits for them. Does PacSun want a visible queue for
   executives, only for assistants, or not at all?
2. **Projects and other channels:** should Slack, WhatsApp, or Teams threads
   flow into projects? That raises ownership and consent questions for private
   channels; the code has a marked extension point and no implementation.
3. **Office 365 timeline:** when could a test tenant and delegated admin
   consent (Mail.Read, Calendars.Read.Shared, Calendars.ReadWrite, Mail.Send)
   be available for a pilot group? That is the unblocking step for real
   calendars; see `docs/architecture.md`.
