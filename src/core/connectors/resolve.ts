import type { CalendarConnector, DirectoryConnector, MailConnector } from "@/core/connectors";
import { GraphCalendarConnector, GraphDirectoryConnector, GraphMailConnector } from "@/core/connectors/graph";
import { MockCalendarConnector, MockDirectoryConnector, MockMailConnector } from "@/core/connectors/mock";

/**
 * The data-access seam. Everything that reads mail, calendars, or the
 * directory asks here, so switching from synthetic fixtures to Microsoft
 * Graph is one environment variable, not a code change.
 *
 *   DATA_SOURCE=synthetic  (default) the fixtures in src/data
 *   DATA_SOURCE=graph      the Graph stub; fails loudly until implemented
 */
export type DataSourceKind = "synthetic" | "graph";

export type Connectors = {
  kind: DataSourceKind;
  mail: MailConnector;
  calendar: CalendarConnector;
  directory: DirectoryConnector;
};

export function dataSourceKind(env: Readonly<Record<string, string | undefined>> = process.env): DataSourceKind {
  return env.DATA_SOURCE?.trim().toLowerCase() === "graph" ? "graph" : "synthetic";
}

export function connectors(env: Readonly<Record<string, string | undefined>> = process.env): Connectors {
  if (dataSourceKind(env) === "graph") {
    return { kind: "graph", mail: new GraphMailConnector(), calendar: new GraphCalendarConnector(), directory: new GraphDirectoryConnector() };
  }
  return { kind: "synthetic", mail: new MockMailConnector(), calendar: new MockCalendarConnector(), directory: new MockDirectoryConnector() };
}
