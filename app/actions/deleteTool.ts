"use server";

import { eq } from "drizzle-orm";
import { toolParameters, tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const deleteTool = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  console.log(args, Object.fromEntries(args.entries()));
  if (!uuid) return;
  const cxn = drizzle();
  await cxn.delete(toolParameters).where(eq(toolParameters.toolUuid, uuid));
  await cxn.delete(tools).where(eq(tools.uuid, uuid));
  await cxn.end();
  redirect("/tools");
};

export default deleteTool;
