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
  const root = getMissionPath(missionUuid);
  const fullPath = path.join(root, filename);
  if (!fs.existsSync(fullPath)) {
    const ls = fs.readdirSync(root);
    return {
      success: false,
      ls,
    };
  }
  return {
    contents: fs
      .readFileSync(path.join(getMissionPath(missionUuid), filename))
      .toString(),
    success: true,
  };
};

export default createAPIGatewayProxyHandler({
  logic,
  includeHeaders: ["x-padawan-mission"],
});
