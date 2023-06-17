"use server";

import { eq } from "drizzle-orm";
import {
  PARAMETER_TYPE,
  PARAMETER_TYPES,
  toolParameters,
} from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const createToolParameter = async (args: FormData) => {
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
  await cxn.insert(toolParameters).values({
    name,
    description,
    type: paramType as PARAMETER_TYPE,
    createdDate: new Date(),
    updatedDate: new Date(),
    toolUuid: uuid,
  });
  await cxn.end();
  redirect(`/tools/${uuid}`);
};

export default createToolParameter;
