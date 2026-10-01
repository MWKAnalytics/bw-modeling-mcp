interface ToolSchema {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
}

/**
 * The refusal for arguments a tool does not declare, or undefined when there are none.
 *
 * Handlers read the arguments they know and pass over the rest, so a misspelt or invented
 * parameter used to vanish while the call still reported success. Only top-level names are
 * checked; nested objects are validated where they are interpreted.
 */
export function undeclaredArguments(
  tool: ToolSchema | undefined,
  args: Record<string, unknown> | undefined,
): string | undefined {
  if (!tool || !args) return undefined;
  const known = Object.keys(tool.inputSchema.properties ?? {});
  const unknown = Object.keys(args).filter((k) => !known.includes(k));
  if (unknown.length === 0) return undefined;
  return (
    `${tool.name} does not take ${unknown.map((k) => `"${k}"`).join(', ')}, so nothing was changed. ` +
    `Its parameters are: ${known.join(', ')}.`
  );
}
