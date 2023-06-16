"use server";

import { eq } from "drizzle-orm";
import { tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const updateToolApi = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const api = args.get("api");
  if (typeof api !== "string") {
    throw new Error(`Invalid api: ${api}`);
  }
  const cxn = drizzle();
  await cxn
    .update(tools)
    .set({ api, updatedDate: new Date() })
    .where(eq(tools.uuid, uuid));
  await cxn.end();
  redirect(`/tools/${uuid}`);
};

export default updateToolApi;
