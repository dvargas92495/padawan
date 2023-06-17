import express from "express";
import esbuild from "esbuild";
import readDir from "@samepage/scripts/internal/readDir";
import appPath from "@samepage/scripts/internal/appPath";
import getDotEnvObject from "@samepage/scripts/internal/getDotEnvObject";
import debugMod from "debug";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { spawn } from "child_process";
import type { APIGatewayProxyHandler, Context, Handler } from "aws-lambda";
import { qsToJson } from "@samepage/backend/createAPIGatewayProxyHandler";
import { v4 } from "uuid";
import format from "date-fns/format";
import addSeconds from "date-fns/addSeconds";
import differenceInMilliseconds from "date-fns/differenceInMilliseconds";
import ngrok from "ngrok";
dotenv.config();

const debug = debugMod("api");
const METHODS = ["get", "post", "put", "delete", "options"] as const;
const METHOD_SET = new Set<string>(METHODS);
type ExpressMethod = (typeof METHODS)[number];
const fileHashes: { [key: string]: string } = {};
const optionRoutes = new Set();
const inlineTryCatch = <T>(tryFcn: () => T, catchFcn: (e: Error) => T): T => {
  try {
    return tryFcn();
  } catch (e) {
    return catchFcn(e as Error);
  }
};

const path = "api";
const out = "build";

const generateContext = ({
  functionName,
  executionTimeStarted,
}: {
  functionName: string;
  executionTimeStarted: Date;
}): Context => {
  const executionTimeout = addSeconds(executionTimeStarted, 10);
  return {
    awsRequestId: v4(),
    callbackWaitsForEmptyEventLoop: true,
    clientContext: undefined,
    functionName,
    functionVersion: `$LATEST`,
    identity: undefined,
    invokedFunctionArn: `offline_invokedFunctionArn_for_${functionName}`,
    logGroupName: `offline_logGroupName_for_${functionName}`,
    logStreamName: `offline_logStreamName_for_${functionName}`,
    memoryLimitInMB: String(128),
    getRemainingTimeInMillis: () => {
      const timeLeft = differenceInMilliseconds(executionTimeout, new Date());
      return timeLeft > 0 ? timeLeft : 0;
    },
    // these three are deprecated
    done: () => ({}),
    fail: () => ({}),
    succeed: () => ({}),
  };
};

const api = async () => {
  process.env.NODE_ENV = process.env.NODE_ENV || "development";

  debug(
    "Preparing the API build from",
    path,
    "in",
    process.env.NODE_ENV,
    "mode..."
  );
  const app = express();
  app.use(function (req, _, next) {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", function (chunk) {
      data += chunk;
    });
    req.on("end", function () {
      req.body = data;
      next();
    });
  });
  const entries = readDir(path);
  const rebuildCallback = async (file: string) => {
    const filePath = appPath(
      file.replace(new RegExp(`^${path}`), out).replace(/\.ts$/, ".js")
    );
    const loadHandler = () => {
      const hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
      if (fileHashes[filePath] !== hash) {
        Object.keys(require.cache)
          .filter((k) => k.includes(filePath))
          .forEach((k) => delete require.cache[k]);
        fileHashes[filePath] = hash;
      }
      return require(filePath);
    };
    const functionName = file
      .replace(new RegExp(`^${path}[\\\\/]`), "")
      .replace(/\.[tj]s$/, "");
    const paths = functionName.split(/[\\\\/]/);
    const method = paths.slice(-1)[0].toLowerCase() as ExpressMethod;
    const route = `/${
      METHOD_SET.has(method) ? paths.slice(0, -1).join("/") : paths.join("/")
    }`;

    if (METHOD_SET.has(method)) {
      app[method](route, (req, res) => {
        debug(`Received Request ${method} ${req.path}`);
        const handler = loadHandler().default as APIGatewayProxyHandler;

        if (typeof handler !== "function") {
          return res
            .header("Content-Type", "application/json")
            .status(502)
            .json({
              errorMessage: `Could not find function handler for ${functionName}`,
              errorType: "HANDLER_NOT_FOUND",
            });
        }
        const { headers, body: _body, params, url, ip } = req;
        const searchParams = Array.from(
          new URL(url || "", "http://example.com").searchParams.entries()
        );
        const executionTimeStarted = new Date();
        const simpleHeaders = Object.fromEntries(
          Object.entries(headers).map(([h, v]) => [
            h,
            typeof v === "object" ? v[0] : v,
          ])
        );
        const body =
          simpleHeaders["content-type"] === "application/x-www-form-urlencoded"
            ? JSON.stringify(qsToJson(_body))
            : _body;
        const event = {
          body,
          headers: simpleHeaders,
          httpMethod: method,
          isBase64Encoded: false, // TODO hook up
          multiValueHeaders: Object.fromEntries(
            Object.entries(headers).map(([h, v]) => [
              h,
              typeof v === "string" ? [v] : v,
            ])
          ),
          multiValueQueryStringParameters: searchParams.reduce(
            (prev, [k, v]) => {
              if (prev[k]) {
                prev[k].push(v);
              } else {
                prev[k] = [v];
              }
              return prev;
            },
            {} as { [k: string]: string[] }
          ),
          path: route,
          pathParameters: Object.keys(params).length ? params : null,
          queryStringParameters: Object.fromEntries(searchParams),
          requestContext: {
            accountId: "offlineContext_accountId",
            apiId: "offlineContext_apiId",
            authorizer: {},
            domainName: "offlineContext_domainName",
            domainPrefix: "offlineContext_domainPrefix",
            extendedRequestId: v4(),
            httpMethod: method,
            identity: {
              accessKey: null,
              accountId:
                process.env.SLS_ACCOUNT_ID || "offlineContext_accountId",
              apiKey: process.env.SLS_API_KEY || "offlineContext_apiKey",
              apiKeyId: process.env.SLS_API_KEY_ID || "offlineContext_apiKeyId",
              caller: process.env.SLS_CALLER || "offlineContext_caller",
              clientCert: null,
              cognitoAuthenticationProvider:
                simpleHeaders["cognito-authentication-provider"] ||
                process.env.SLS_COGNITO_AUTHENTICATION_PROVIDER ||
                "offlineContext_cognitoAuthenticationProvider",
              cognitoAuthenticationType:
                process.env.SLS_COGNITO_AUTHENTICATION_TYPE ||
                "offlineContext_cognitoAuthenticationType",
              cognitoIdentityId:
                simpleHeaders["cognito-identity-id"] ||
                process.env.SLS_COGNITO_IDENTITY_ID ||
                "offlineContext_cognitoIdentityId",
              cognitoIdentityPoolId:
                process.env.SLS_COGNITO_IDENTITY_POOL_ID ||
                "offlineContext_cognitoIdentityPoolId",
              principalOrgId: null,
              sourceIp: ip,
              user: "offlineContext_user",
              userAgent: simpleHeaders["user-agent"] || "",
              userArn: "offlineContext_userArn",
            },
            path: route,
            protocol: "HTTP/1.1",
            requestId: v4(),
            requestTime: format(
              executionTimeStarted,
              "dd/MMM/yyyy:HH:mm:ss zzz"
            ),
            requestTimeEpoch: executionTimeStarted.valueOf(),
            resourceId: "offlineContext_resourceId",
            resourcePath: route,
            stage: "dev",
          },
          resource: route,
          stageVariables: null,
        };
        const context = generateContext({
          functionName,
          executionTimeStarted,
        });

        const result = handler(event, context, () => ({}));
        return Promise.resolve(result || undefined)
          .then((result) => {
            const executionTime = differenceInMilliseconds(
              new Date(),
              executionTimeStarted
            );
            debug(`Executed ${method} ${req.path} in ${executionTime}ms`);
            return result;
          })
          .then((result) => {
            if (!result || typeof result.body !== "string") {
              return res
                .header("Content-Type", "application/json")
                .status(502)
                .json({
                  errorMessage: "Invalid body returned",
                  errorType: "INVALID_BODY",
                });
            }
            Object.entries(result.headers || {}).forEach(([k, v]) =>
              res.append(k, v.toString())
            );
            Object.entries(result.multiValueHeaders || {}).forEach(([k, vs]) =>
              vs.forEach((v) => res.append(k, v.toString()))
            );
            res.status(result.statusCode || 200);
            return result.isBase64Encoded
              ? res
                  .setDefaultEncoding("binary")
                  .send(Buffer.from(result.body, "base64"))
              : inlineTryCatch(
                  () => res.json(JSON.parse(result.body)),
                  () => res.send(result.body)
                );
          })
          .catch((error: Error) => {
            const message = error.message || error.toString();
            console.error(message, "\n", error);
            return res
              .header("Content-Type", "application/json")
              .status(502)
              .json({
                errorMessage: message,
                errorType: error.constructor.name,
                stackTrace: (error.stack || "")
                  .split("\n")
                  .map((l) => l.trim()),
              });
          });
      });
    } else {
      app.post(route, (req, res) => {
        const handler = loadHandler();
        handler.default(JSON.parse(req.body));
        res.status(200).json({ success: true });
      });
    }
    debug(
      `Added Route ${
        METHOD_SET.has(method) ? method.toUpperCase() : "POST"
      } ${route}`
    );

    if (!optionRoutes.has(route)) {
      optionRoutes.add(route);
      app.options(route, (req, res) =>
        res
          .status(200)
          .header(
            "Access-Control-Allow-Headers",
            req.headers["access-control-request-headers"]
          )
          .header("Access-Control-Allow-Origin", req.headers["origin"])
          .header(
            "Access-Control-Allow-Methods",
            req.headers["access-control-request-method"]
          )
          .send()
      );
    }
  };
  await new Promise<void>(async (resolve) => {
    const context = await esbuild.context({
      bundle: true,
      outdir: out,
      platform: "node",
      external: [
        "canvas",
        "esbuild",
        "@google-cloud/functions-framework",
        "google-gax",
      ],
      loader: {
        ".node": "file",
      },
      define: getDotEnvObject(),
      entryPoints: Object.fromEntries(
        entries.map((file) => [
          file.replace(/^api\//, "").replace(/\.ts$/, ""),
          file,
        ])
      ),
      plugins: [
        {
          name: "log",
          setup: (build) => {
            build.onEnd(async (result) => {
              await Promise.all(entries.map(rebuildCallback));
              console.log(`api built with ${result.errors.length} errors`);
              resolve();
            });
          },
        },
      ],
    });
    context.watch();
  });
  const port = 3001;
  app.use((req, res) => {
    console.error(`Route not found: ${req.method} - ${req.path}`);
    res
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
      .status(404)
      .json({
        currentRoute: `${req.method} - ${req.path}`,
        error: "Route not found.",
        statusCode: 404,
      });
  });
  app.listen(port, () => {
    console.log(`API server listening on port ${port}...`);
    const out = spawn(
      "npm",
      ["run", "dev"]
      // { stdio: "inherit" }
    );
    out.stdout.on("data", (data) => {
      const message = data.toString();
      process.stdout.write(message);
      if (message.includes("ready started server on")) {
        ngrok
          .connect({
            subdomain: "vargas",
            addr: 3000,
          })
          .then((url) => {
            console.log(`Public URL: ${url}`);
          });
      }
    });
  });
};

api();
