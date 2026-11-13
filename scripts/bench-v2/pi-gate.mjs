// Pi's turn hook limits actual work, rather than clipping the reported count.
export default function install(pi) {
  const limit = Number(process.env.CU_BENCH_TURNS);
  let turns = 0;
  pi.on('turn_start', (_event, context) => {
    if (++turns > limit) {
      process.stderr.write('CU_BENCH_TURN_CAP_REACHED\n');
      context.abort();
    }
  });
  pi.on('tool_call', event => {
    if (turns > limit) return {block: true, reason: 'Benchmark turn cap reached.', terminate: true};
    if (!['mcp__cua__js', 'mcp__cua__js_reset'].includes(event.toolName)) {
      return {block: true, reason: 'Only the two benchmark MCP tools are available.', terminate: true};
    }
  });
}
