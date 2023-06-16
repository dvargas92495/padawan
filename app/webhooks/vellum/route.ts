export const POST = async (_: Request) => {
  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
