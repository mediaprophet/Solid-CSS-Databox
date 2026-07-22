import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SolidModuleManifest } from '../../SolidModuleManifest';
import type { CmsModuleRouter } from '../../CmsModuleRouter';

export const MCP_SERVER_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'mcp-server',
  name: 'AI Agent Native Shop (MCP)',
  version: '0.1.0',
  description: 'Exposes an MCP Server (Model Context Protocol) over SSE for AI ' +
    'agents to query shop inventory and bookings directly.',
  capabilities: [
    'cms:mcp-sse',
  ],
  routes: [
    '/mcp/sse',
    '/mcp/messages',
  ],
};

export class McpServerApi {
  public constructor() {
    // No initialization needed
  }

  public async handleSseConnection(response: ServerResponse): Promise<void> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    // Write initial endpoint event as required by MCP over SSE
    response.write(`event: endpoint\n`);
    response.write(`data: /mcp/messages\n\n`);

    // In a real implementation, we would store this response stream
    // mapped to a connection ID to push future MCP messages to it.
  }

  public async handleMessages(request: IncomingMessage, response: ServerResponse): Promise<void> {
    void request;
    // Process incoming MCP JSON-RPC messages (e.g., tools/call)
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = 202;
    response.end('Accepted');
  }
}

export function registerMcpRoutes(router: CmsModuleRouter): void {
  const api = new McpServerApi();

  router.register('GET', '/mcp/sse', async({ response }: { response: ServerResponse }): Promise<void> => {
    await api.handleSseConnection(response);
  });

  router.register(
    'POST',
    '/mcp/messages',
    async({ request, response }: { request: IncomingMessage; response: ServerResponse }): Promise<void> => {
      await api.handleMessages(request, response);
    },
  );
}
