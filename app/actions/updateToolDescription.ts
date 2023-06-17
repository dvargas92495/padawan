"use server";

import { eq } from "drizzle-orm";
import { tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const updateToolApi = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const description = args.get("description");
  if (typeof description !== "string") {
    throw new Error(`Invalid description: ${description}`);
  }
  const cxn = drizzle();
  await cxn
    .update(tools)
    .set({ description, updatedDate: new Date() })
    .where(eq(tools.uuid, uuid));
  await cxn.end();
  redirect(`/tools/${uuid}`);
};

export default updateToolApi;
