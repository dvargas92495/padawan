"use server";

import { eq } from "drizzle-orm";
import { tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const updateToolFormat = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const format = args.get("format");
  if (typeof format !== "string") {
    throw new Error(`Invalid format: ${format}`);
  }
  const cxn = drizzle();
  await cxn
    .update(tools)
    .set({ format, updatedDate: new Date() })
    .where(eq(tools.uuid, uuid));
  await cxn.end();
  redirect(`/tools/${uuid}`);
};

export default updateToolFormat;
