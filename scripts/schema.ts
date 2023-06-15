import { text, timestamp, pgTable, uuid } from "drizzle-orm/pg-core";

export const METHODS = ["GET", "POST", "PUT", "DELETE"] as const;
export type METHOD = (typeof METHODS)[number];

export const PARAMETER_TYPES = ["string", "boolean", "number"] as const;
export type PARAMETER_TYPE = (typeof PARAMETER_TYPES)[number];

export const tools = pgTable("tools", {
  uuid: uuid("uuid"),
  name: text("name"),
  description: text("description"),
  api: text("api"),
  method: text("method").$type<METHOD>(),
  createdDate: timestamp("created_date"),
  updatedDate: timestamp("updated_date"),
});

export const toolParameters = pgTable("tool_parameters", {
  uuid: uuid("uuid"),
  toolUuid: uuid("tool_uuid"),
  name: text("name"),
  description: text("description"),
  type: text("type").$type<PARAMETER_TYPE>(),
  createdDate: timestamp("created_date"),
  updatedDate: timestamp("updated_date"),
});

export const missions = pgTable("missions", {
  uuid: uuid("uuid"),
  label: text("label"),
  startDate: timestamp("start_date"),
});

// export const missionEvents = mysqlTable("mission_events", {
//   uuid: primaryUuid(),
//   missionUuid: uuid("mission_uuid").notNull(),
//   status: varchar("status", { length: 64 }).notNull().default(""),
//   createdDate: date("created"),
// });

// export const missionSteps = mysqlTable("mission_steps", {
//   uuid: primaryUuid(),
//   missionUuid: uuid("mission_uuid").notNull(),
//   stepHash: varchar("step_hash", { length: 128 }).notNull().default(""),
//   executionDate: date("execution"),
// });
