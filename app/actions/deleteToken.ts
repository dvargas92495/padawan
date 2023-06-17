"use server";

import { eq } from "drizzle-orm";
import { tokens } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const deleteTool = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const cxn = drizzle();
  await cxn.delete(tokens).where(eq(tokens.uuid, uuid));
  await cxn.end();
  redirect("/tokens");
};

export default deleteTool;
