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
import RootStyleRegistry from "./emotion";

const drawerWidth = 240;

const TABS = [
  { name: "Home", path: "/", Icon: HomeSharpIcon },
  { name: "Tools", path: "/tools", Icon: HandymanIcon },
  { name: "Missions", path: "/missions", Icon: RocketIcon },
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
          <Box
            component="nav"
            sx={{ width: drawerWidth, flexShrink: 0 }}
            aria-label="mailbox folders"
          >
            <Drawer variant="permanent" open={true}>
              <Toolbar />
              <Divider />
              <List>
                {TABS.map(({ name, path, Icon }) => (
                  <ListItem key={name} disablePadding>
                    <ListItemButton href={`/${path}`}>
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
        </RootStyleRegistry>
      </body>
    </html>
  );
}
