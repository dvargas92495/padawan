import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import fs from "fs";
import path from "path";
import getMissionPath from "src/utils/getMissionPath";

const logic = ({
  filename,
  text,
  position,
  ["x-padawan-mission"]: missionUuid,
}: {
  filename: string;
  text: string;
  position: number;
  "x-padawan-mission": string;
}) => {
  const fullPath = path.join(getMissionPath(missionUuid), filename);
  const content = fs.readFileSync(fullPath, "utf8");
  const newContent = `${content.slice(0, position)}${text}${content.slice(
    position
  )}`;
  fs.writeFileSync(fullPath, newContent);
  return {
    success: true,
  };
};

export default createAPIGatewayProxyHandler({
  logic,
  includeHeaders: ["x-padawan-mission"],
});
