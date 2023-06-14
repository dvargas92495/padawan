import createAPIGatewayHandler from "@samepage/backend/createAPIGatewayProxyHandler";

const logic = (args: {}) => {
  console.log(args);
  return {};
};

export default createAPIGatewayHandler(logic);
