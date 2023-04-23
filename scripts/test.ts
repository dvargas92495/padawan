import dotenv from "dotenv";
dotenv.config();
import develop from "../api/develop";

const test = () => {
    // @ts-ignore
   const out = develop({
        owner: process.argv[2], 
        repo: process.argv[3],
        issue: Number(process.argv[4]),
        type: "User",
    });
    console.log(out);
};

test();
