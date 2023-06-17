import { sql, eq } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { tools, METHOD, PARAMETER_TYPE, toolParameters } from "scripts/schema";

const getToolQuery = (cxn: PostgresJsDatabase) =>
  cxn
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
    .groupBy(tools.uuid);

export default getToolQuery;
