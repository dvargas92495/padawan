import { S3 } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const getToken = (id = 0, type: "user" | "bot" = "bot") =>
  new S3({})
    .getObject({
      Bucket: "app.davidvargas.me",
      Key: `.secret/access-tokens/${id}/${type}`,
    })
    .then((r) => {
      const Body = r.Body as Readable;
      if (!Body) throw new Error(`No token found for installation ${id}`);
      const chunks: Buffer[] = [];
      return new Promise<string>((resolve, reject) => {
        Body.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        Body.on("error", (err) => reject(err));
        Body.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    });

export default getToken;
