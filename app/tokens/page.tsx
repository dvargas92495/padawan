"use client";
import React from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import createToken from "app/actions/createToken";
import deleteToken from "app/actions/deleteToken";
import getTokens, { GetTokensResponse } from "app/actions/getTokens";

const TokensPage = () => {
  const [tokens, setTokens] = React.useState<GetTokensResponse["tokens"]>([]);
  React.useEffect(() => {
    getTokens().then((r) => setTokens(r.tokens));
  }, [setTokens]);
  return (
    <Box>
      <Typography variant="h2">Tokens</Typography>
      {tokens.map((token) => (
        <Box
          key={token.uuid}
          display={"flex"}
          gap={2}
          alignItems={"center"}
          marginTop={2}
        >
          <Typography
            variant="body1"
            component={"code"}
            sx={{ width: "320px" }}
          >
            {token.domain}
          </Typography>
          <Typography variant="body1" component={"code"} sx={{ flexGrow: 1 }}>
            {token.token.replace(/./g, "*")}
          </Typography>
          <form action={deleteToken}>
            <input type="hidden" name="uuid" value={token.uuid} />
            <IconButton type={"submit"}>
              <DeleteIcon />
            </IconButton>
          </form>
        </Box>
      ))}
      <Box
        component={"form"}
        display={"flex"}
        gap={2}
        alignItems={"center"}
        action={createToken}
        marginTop={2}
      >
        <TextField name={`domain`} label={"Domain"} sx={{ width: "320px" }} />
        <TextField
          name={`token`}
          label={"Token"}
          type="password"
          sx={{ flexGrow: 1 }}
        />
        <IconButton type={"submit"} color="primary">
          <AddIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

export default TokensPage;
