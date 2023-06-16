"use server";

import { eq, sql } from "drizzle-orm";
import { METHOD, PARAMETER_TYPE, toolParameters, tools } from "scripts/schema";
import drizzle from "src/utils/drizzle";

const getTool = async (args: { uuid: string }) => {
  const cxn = drizzle();
  const [tool] = await cxn
    .select({
      uuid: tools.uuid,
      name: sql<string>`min(${tools.name})`,
      description: sql<string>`min(${tools.description})`,
      api: sql<string>`min(${tools.api})`,
      method: sql<METHOD>`min(${tools.method})`,
      format: sql<METHOD>`min(${tools.format})`,
      parameters: sql<
        {
          uuid: string;
          name: string;
          description: string;
          type: PARAMETER_TYPE;
        }[]
      >`coalesce(
        jsonb_agg(
          jsonb_build_object(
            'uuid',${toolParameters.uuid},
            'name',${toolParameters.name},
            'description',${toolParameters.description},
            'type',${toolParameters.type}
          )
        ) FILTER (WHERE ${toolParameters.uuid} IS NOT NULL), 
        '[]'::jsonb
      )`,
    })
    .from(tools)
    .leftJoin(toolParameters, eq(tools.uuid, toolParameters.toolUuid))
    .where(eq(tools.uuid, args.uuid))
    .groupBy(tools.uuid);
  await cxn.end();
  return tool;
};

export default getTool;
