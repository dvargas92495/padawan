import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();

const connectionString = process.env.DATABASE_URL || "";
const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

migrate(db, { migrationsFolder: "drizzle" }).finally(() => db.end());
