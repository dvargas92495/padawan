import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const drizzle = ({ logger }: { logger?: true } = {}) => {
  const connectionString = process.env.DATABASE_URL || "";
  const sql = postgres(connectionString, { max: 1 });
  return drizzlePg(sql, { logger });
};

export default drizzle;
