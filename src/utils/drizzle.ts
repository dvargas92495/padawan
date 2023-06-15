import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const drizzle = () => {
  const connectionString = process.env.DATABASE_URL || "";
  const sql = postgres(connectionString, { max: 1 });
  return drizzlePg(sql);
};

export default drizzle;
