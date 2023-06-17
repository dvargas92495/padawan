import { Configuration, OpenAIApi } from "openai";

const openai = () => {
  return new OpenAIApi(
    new Configuration({
      apiKey: process.env.OPENAI_API_KEY || "",
    })
  );
};

export default openai;
