"use server";

import { eq, sql } from "drizzle-orm";
import { missionEvents, missions, missionSteps } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import vellumClient from "src/utils/vellumClient";

const getMission = async (args: { uuid: string }) => {
  const cxn = drizzle();
  const [mission] = await cxn
    .select({
      uuid: missions.uuid,
      label: sql<string>`min(${missions.label})`,
      startDate: sql<string>`min(${missions.startDate})`,
      status: sql<string>`max(${missionEvents.status})`,
      report: sql<string>`min(${missions.reportId})`,
      steps: sql<
        {
          hash: string;
          functionName: string;
          functionArgs: Record<string, string | number | boolean>;
          observation: string;
          executionDate: Date;
          endDate: Date;
        }[]
      >`coalesce(
        jsonb_agg(
          jsonb_build_object(
            'functionName',${missionSteps.functionName},
            'functionArgs',${missionSteps.functionArgs},
            'observation',${missionSteps.observation},
            'executionDate',${missionSteps.executionDate},
            'endDate',${missionSteps.endDate}
          )
        ) FILTER (WHERE ${missionSteps.uuid} IS NOT NULL), 
        '[]'::jsonb
      )`,
    })
    .from(missions)
    .leftJoin(missionSteps, eq(missions.uuid, missionSteps.missionUuid))
    .leftJoin(missionEvents, eq(missions.uuid, missionEvents.missionUuid))
    .where(eq(missions.uuid, args.uuid))
    .groupBy(missions.uuid);
  await cxn.end();
  // @ts-ignore
  return mission;
};

export default getMission;
