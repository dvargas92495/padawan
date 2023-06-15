"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { toolParameters } from "scripts/schema";
import drizzle from "src/utils/drizzle";

const deleteToolParameter = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const cxn = drizzle();
  const [{ toolUuid }] = await cxn
    .delete(toolParameters)
    .where(eq(toolParameters.uuid, uuid))
    .returning({ toolUuid: toolParameters.toolUuid });
  await cxn.end();
  redirect(`/tools/${toolUuid}`);
};

export default deleteToolParameter;
