import { text, timestamp, pgTable, uuid } from "drizzle-orm/pg-core";

export const tools = pgTable("tools", {
  uuid: uuid("uuid"),
  name: text("name"),
  description: text("description"),
  api: text("api"),
  method: text("method").$type<"GET" | "POST" | "PUT" | "DELETE">(),
  createdDate: timestamp("created_date"),
  updatedDate: timestamp("updated_date"),
});

export const toolParameters = pgTable("tool_parameters", {
  uuid: uuid("uuid"),
  tool_uuid: uuid("tool_uuid"),
  name: text("name"),
  description: text("description"),
  type: text("method").$type<"string" | "boolean" | "number">(),
  createdDate: timestamp("created_date"),
  updatedDate: timestamp("updated_date"),
});
