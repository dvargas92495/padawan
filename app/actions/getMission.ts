"use server";

import { eq, sql } from "drizzle-orm";
import { missions, missionSteps } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import getMissionPath from "src/utils/getMissionPath";
import path from "path";
import fs from "fs";

const getMission = async (args: { uuid: string }) => {
  const cxn = drizzle();
  const [mission] = await cxn
    .select({
      uuid: missions.uuid,
      label: sql<string>`min(${missions.label})`,
      startDate: sql<string>`min(${missions.startDate})`,
      report: sql<string>`min(${missions.reportId})`,
      steps: sql<
        {
          hash: string;
          functionName: string;
          // TODO - Figure out why this is not returning the correct type
          functionArgs: string; // Record<string, string | number | boolean>;
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
          ) ORDER BY execution_date
        ) FILTER (WHERE ${missionSteps.uuid} IS NOT NULL), 
        '[]'::jsonb
      )`,
    })
    .from(missions)
    .leftJoin(missionSteps, eq(missions.uuid, missionSteps.missionUuid))
    .where(eq(missions.uuid, args.uuid))
    .groupBy(missions.uuid);
  await cxn.end();
  const reportFile = path.join(getMissionPath(mission.uuid), "report.txt");
  mission.report = fs.existsSync(reportFile)
    ? fs.readFileSync(reportFile).toString()
    : "";
  return mission;
};

export default getMission;
