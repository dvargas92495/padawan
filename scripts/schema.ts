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
