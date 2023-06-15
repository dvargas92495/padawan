"use client";
import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import TablePagination from "@mui/material/TablePagination";
import type { Response } from "../../api/missions/get";
import { useRouter } from "next/navigation";

type Column = {
  id: "label" | "startDate" | "steps";
  label: string;
  width?: number;
  align?: "right";
};

const columns: Column[] = [
  { id: "label", label: "Label", width: 200 },
  { id: "startDate", label: "Start Date", width: 200 },
  { id: "steps", label: "Steps", width: 60 },
];

async function getMissions() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/missions`);
  const json = (await res.json()) as Response;
  return json.missions;
}

const MissionLayout = ({ children }: { children: React.ReactNode }) => {
  const [missions, setMissions] = React.useState<Response["missions"]>([]);
  React.useEffect(() => {
    getMissions().then(setMissions);
  }, [setMissions]);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const handleChangePage = React.useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage);
    },
    [setPage]
  );

  const handleChangeRowsPerPage = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(+event.target.value);
      setPage(0);
    },
    [setPage, setRowsPerPage]
  );
  const router = useRouter();
  return (
    <Box display={"flex"} gap={"48px"}>
      <Box flexShrink={0}>
        <h2 className="text-xl">Past Missions</h2>
        <Paper sx={{ width: "100%", overflow: "hidden" }}>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader aria-label="sticky table">
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align={column.align}
                      style={{
                        width: column.width,
                      }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody
                sx={{
                  "& .MuiTableCell-root": {
                    overflowWrap: "anywhere",
                  },
                }}
              >
                {missions
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((row) => {
                    return (
                      <TableRow
                        hover
                        role="checkbox"
                        tabIndex={-1}
                        key={row.uuid}
                        sx={{
                          cursor: "pointer",
                        }}
                        onClick={() => router.push(`/missions/${row.uuid}`)}
                      >
                        {columns.map((column) => {
                          const value = row[column.id];
                          return (
                            <TableCell key={column.id} align={column.align}>
                              {value}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 100]}
            component="div"
            count={missions.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      </Box>
      <Box flexGrow={"1"} overflow={"auto"}>
        {children}
      </Box>
    </Box>
  );
};

export default MissionLayout;
