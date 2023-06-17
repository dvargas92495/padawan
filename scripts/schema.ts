import {
  text,
  timestamp,
  pgTable,
  uuid,
  json,
  index,
} from "drizzle-orm/pg-core";

export const METHODS = ["GET", "POST", "PUT", "DELETE"] as const;
export type METHOD = (typeof METHODS)[number];

export const PARAMETER_TYPES = ["string", "boolean", "number"] as const;
export type PARAMETER_TYPE = (typeof PARAMETER_TYPES)[number];

export const tools = pgTable("tools", {
  uuid: uuid("uuid").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  api: text("api"),
  method: text("method").$type<METHOD>(),
  format: text("format"),
  createdDate: timestamp("created_date"),
  updatedDate: timestamp("updated_date"),
});

export const toolParameters = pgTable(
  "tool_parameters",
  {
    uuid: uuid("uuid"),
    toolUuid: uuid("tool_uuid"),
    name: text("name"),
    description: text("description"),
    type: text("type").$type<PARAMETER_TYPE>(),
    createdDate: timestamp("created_date"),
    updatedDate: timestamp("updated_date"),
  },
  (table) => ({
    toolIndex: index("IX_tool_index").on(table.toolUuid),
  })
);

export const missions = pgTable("missions", {
  uuid: uuid("uuid").primaryKey(),
  label: text("label").notNull(),
  startDate: timestamp("start_date"),
  reportId: text("report_id"),
});

export const missionEvents = pgTable(
  "mission_events",
  {
    uuid: uuid("uuid"),
    missionUuid: uuid("mission_uuid"),
    status: text("status"),
    createdDate: timestamp("created_date"),
    details: text("details"),
  },
  (table) => ({
    missionIndex: index("IX_mission_index").on(table.missionUuid),
  })
);

export const missionSteps = pgTable(
  "mission_steps",
  {
    uuid: uuid("uuid").primaryKey(),
    missionUuid: uuid("mission_uuid"),
    functionName: text("function_name").notNull(),
    functionArgs: json("function_args"),
    executionDate: timestamp("execution_date"),
    endDate: timestamp("end_date"),
    observation: text("observation").notNull().default(""),
  },
  (table) => ({
    missionIndex: index("IX_mission_index").on(table.missionUuid),
  })
);

export const tokens = pgTable("tokens", {
  uuid: uuid("uuid").primaryKey(),
  token: text("token").notNull(),
  domain: text("domain").notNull(),
  createdDate: timestamp("created_date"),
  updatedDate: timestamp("updated_date"),
});
