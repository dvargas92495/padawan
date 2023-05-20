import express from "express";
import esbuild from "esbuild";
import readDir from "@samepage/scripts/internal/readDir";
import appPath from "@samepage/scripts/internal/appPath";
import getDotEnvObject from "@samepage/scripts/internal/getDotEnvObject";
import debugMod from "debug";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const debug = debugMod("api");
const METHODS = ["get", "post", "put", "delete", "options"] as const;
const METHOD_SET = new Set<string>(METHODS);
type ExpressMethod = (typeof METHODS)[number];
const fileHashes: { [key: string]: string } = {};
const optionRoutes = new Set();

const path = "api";
const out = "build";

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

    app.post(route, (req, res) => {
      const handler = loadHandler();
      handler.default(JSON.parse(req.body));
      res.status(200).json({ success: true });
    });
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
  });
};

api();
