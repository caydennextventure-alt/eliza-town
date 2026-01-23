import { readFileSync } from 'node:fs';
import path from 'node:path';

const TOOL_LIST_PATTERN = /```json\s*([\s\S]*?)```/g;

type ToolDefinition = {
  name: string;
};

const loadSpecToolNames = (): string[] => {
  const specPath = path.resolve(process.cwd(), 'specs/eliza-town-werewolf-mvp-mcp-spec.md');
  const content = readFileSync(specPath, 'utf8');
  const blocks = Array.from(content.matchAll(TOOL_LIST_PATTERN), (match) => match[1].trim());
  const toolList = blocks.find((block) => block.startsWith('['));
  if (!toolList) {
    throw new Error('Tool list JSON block not found in MCP spec.');
  }
  const tools = JSON.parse(toolList) as ToolDefinition[];
  return tools.map((tool) => tool.name);
};

const loadServerToolNames = (): string[] => {
  const serverPath = path.resolve(process.cwd(), 'mcp/werewolf/server.ts');
  const content = readFileSync(serverPath, 'utf8');
  const matches = Array.from(content.matchAll(/"name":\s*"([^"]+)"/g), (match) => match[1]);
  return matches.filter((name) => name.startsWith('et.werewolf.'));
};

const normalizeNames = (names: string[]): string[] => {
  return [...new Set(names)].sort();
};

describe('Werewolf MCP tool registry', () => {
  it('matches the MCP spec tool list', () => {
    const specNames = normalizeNames(loadSpecToolNames());
    const serverNames = normalizeNames(loadServerToolNames());

    expect(serverNames).toEqual(specNames);
  });
});
