"use server";

const createTool = async (args: FormData) => {
  console.log(
    args.get("parameters"),
    args.getAll("parameters.name"),
    args.getAll("parameters.description")
  );
  console.log(args);
};

export default createTool;
