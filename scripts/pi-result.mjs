// pi's MCP extension wraps the MCP CallToolResult one level deeper than a
// direct SDK client. Keep native metadata separate from pi's display wrapper.
export function nativeMcpResult(result) {
    return result?.structuredContent?.structuredContent ?? result?.structuredContent;
}
