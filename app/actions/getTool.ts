"use server";

import { eq } from "drizzle-orm";
import { tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import getToolQuery from "src/utils/getToolQuery";

const getTool = async (args: { uuid: string }) => {
  const cxn = drizzle();
  const [tool] = await getToolQuery(cxn).where(eq(tools.uuid, args.uuid));
  await cxn.end();
  return tool;
};

export default getTool;
