/**
 * Compile W3C Design Tokens (DTCG) into CSS custom properties (theming; see
 * `databox/solid-cms-plan.md`, §12.5). A theme package ships DTCG token JSON — a nested tree whose leaves
 * carry a `$value` (and optional `$type`/`$description` meta) — and this flattens it to a
 * `:root { --path-to-token: value; }` block, the drop-in, LLM-editable theming layer. Pure and deterministic.
 */
export function tokensToCss(tokens: Record<string, unknown>): string {
  const declarations: string[] = [];
  collect(tokens, [], declarations);
  return `:root {\n${declarations.map((line): string => `  ${line}`).join('\n')}\n}\n`;
}

function collect(node: Record<string, unknown>, path: string[], out: string[]): void {
  for (const [ key, value ] of Object.entries(node)) {
    // Skip DTCG meta keys ($type, $description, ...); they are not tokens or groups.
    if (key.startsWith('$')) {
      continue;
    }
    const child = value as Record<string, unknown>;
    if ('$value' in child) {
      out.push(`--${[ ...path, key ].join('-')}: ${String(child.$value)};`);
    } else {
      collect(child, [ ...path, key ], out);
    }
  }
}
