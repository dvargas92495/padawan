"use server";

import { eq } from "drizzle-orm";
import { tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const updateToolName = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const name = args.get("name");
  if (typeof name !== "string") {
    throw new Error(`Invalid name: ${name}`);
  }
  const cxn = drizzle();
  await cxn
    .update(tools)
    .set({ name, updatedDate: new Date() })
    .where(eq(tools.uuid, uuid));
  await cxn.end();
  redirect(`/tools/${uuid}`);
};

export default updateToolName;
