import type { Config } from "drizzle-kit";

export default {
  schema: "./scripts/schema.ts",
  out: "./drizzle",
} satisfies Config;
