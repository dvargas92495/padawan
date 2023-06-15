"use server";

import { eq, sql } from "drizzle-orm";
import { METHOD, PARAMETER_TYPE, toolParameters, tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";

const getMission = async (args: { uuid: string }) => {
  const cxn = drizzle();
  const [mission] = await cxn
    .select({
      uuid: tools.uuid,
      label: sql<string>`min(${tools.name})`,
      createdDate: sql<string>`min(${tools.description})`,
      status: sql<string>`min(${tools.api})`,
      report: sql<METHOD>`min(${tools.method})`,
      steps: sql<
        {
          thought: string;
          action: string;
          actionInput: string;
          generation: string;
          uuid: string;
          observation: string;
          date: number;
        }[]
      >`json_agg(tool_parameters.*)`,
    })
    .from(tools)
    .leftJoin(toolParameters, eq(tools.uuid, toolParameters.toolUuid))
    .where(eq(tools.uuid, args.uuid))
    .groupBy(tools.uuid);
  await cxn.end();
  return mission;
};

export default getMission;
