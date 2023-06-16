import { VellumClient } from "vellum-ai";
const vellumClient = new VellumClient({
  apiKey: process.env.VELLUM_API_KEY || "",
});

export default vellumClient;
