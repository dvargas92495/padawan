"use client"; // emotion doesn't support Next 13 - bro. https://github.com/emotion-js/emotion/issues/2928
import React from "react";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Drawer from "@mui/material/Drawer";
import HomeSharpIcon from "@mui/icons-material/HomeSharp";
import HandymanIcon from "@mui/icons-material/Handyman";
import RocketIcon from "@mui/icons-material/Rocket";
import TokenIcon from "@mui/icons-material/Token";
import RootStyleRegistry from "./emotion";
import CssBaseline from "@mui/material/CssBaseline";

const drawerWidth = 240;

const TABS = [
  { name: "Home", path: "/", Icon: HomeSharpIcon },
  { name: "Tools", path: "/tools", Icon: HandymanIcon },
  { name: "Missions", path: "/missions", Icon: RocketIcon },
  { name: "Tokens", path: "/tokens", Icon: TokenIcon },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <RootStyleRegistry>
          <CssBaseline />
          <Box display={"flex"}>
            <Box
              component="nav"
              sx={{ width: drawerWidth, flexShrink: 0 }}
              aria-label="mailbox folders"
            >
              <Drawer
                variant="permanent"
                open={true}
                sx={{
                  display: "block",
                  "& .MuiDrawer-paper": {
                    boxSizing: "border-box",
                    width: drawerWidth,
                  },
                }}
              >
                <Toolbar />
                <Divider />
                <List>
                  {TABS.map(({ name, path, Icon }) => (
                    <ListItem key={name} disablePadding>
                      <ListItemButton href={path}>
                        <ListItemIcon>
                          <Icon />
                        </ListItemIcon>
                        <ListItemText primary={name} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Drawer>
            </Box>
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                p: 3,
                width: `calc(100% - ${drawerWidth}px)`,
              }}
            >
              {children}
            </Box>
          </Box>
        </RootStyleRegistry>
      </body>
    </html>
  );
}
