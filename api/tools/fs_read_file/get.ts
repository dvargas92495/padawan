import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import fs from "fs";
import path from "path";
import getMissionPath from "src/utils/getMissionPath";

const logic = ({
  filename,
  ["x-padawan-mission"]: missionUuid,
}: {
  filename: string;
  "x-padawan-mission": string;
}) => {
  return {
    contents: fs
      .readFileSync(path.join(getMissionPath(missionUuid), filename))
      .toString(),
  };
};

export default createAPIGatewayProxyHandler({
  logic,
  includeHeaders: ["x-padawan-mission"],
});
