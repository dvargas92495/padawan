"use server";

import { eq } from "drizzle-orm";
import {
  PARAMETER_TYPE,
  PARAMETER_TYPES,
  toolParameters,
} from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const updateToolName = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const name = args.get("name");
  if (typeof name !== "string") {
    throw new Error(`Invalid name: ${name}`);
  }
  const description = args.get("description");
  if (typeof description !== "string") {
    throw new Error(`Invalid name: ${description}`);
  }
  const paramType = args.get("type");
  if (
    typeof paramType !== "string" ||
    !PARAMETER_TYPES.includes(paramType as PARAMETER_TYPE)
  ) {
    throw new Error(`Invalid name: ${paramType}`);
  }
  const cxn = drizzle();
  const [{ toolUuid }] = await cxn
    .update(toolParameters)
    .set({
      name,
      description,
      type: paramType as PARAMETER_TYPE,
      updatedDate: new Date(),
    })
    .where(eq(toolParameters.uuid, uuid))
    .returning({ toolUuid: toolParameters.toolUuid });
  await cxn.end();
  redirect(`/tools/${toolUuid}`);
};

export default updateToolName;
