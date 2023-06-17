/** @jsxImportSource @emotion/react */
"use client";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
// import React from "react";

export default function Page() {
  // const [tokens, setTokens] = React.useState<GetInstallationsResponse["tokens"]>([]);
  // React.useEffect(() => {
  //   get().then((r) => setTokens(r.tokens));
  // }, [setTokens]);
  return (
    <Box>
      <List>
        <ListItem>Welcome to Padawan</ListItem>
      </List>
    </Box>
  );
}
