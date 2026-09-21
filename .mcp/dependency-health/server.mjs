#!/usr/bin/env node
// Wrapper local sobre @pramodyadav027/dependency-health-mcp.
// El paquete usa McpServer.setRequestHandler (API que ya no existe en el SDK).
// Aquí se reutilizan sus tools (funciones puras) pero se cablea un Server raw,
// cuya API setRequestHandler es estable en todo el SDK 1.x.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { checkOutdatedPackages } from "@pramodyadav027/dependency-health-mcp/tools/outdated.js";
import { checkVulnerabilities } from "@pramodyadav027/dependency-health-mcp/tools/vulnerabilities.js";
import { analyzeDependencies } from "@pramodyadav027/dependency-health-mcp/tools/analyze.js";
import { checkLicenseCompliance } from "@pramodyadav027/dependency-health-mcp/tools/licenses.js";
import { suggestUpdates } from "@pramodyadav027/dependency-health-mcp/tools/suggest.js";
import { upgradeDependencies } from "@pramodyadav027/dependency-health-mcp/tools/upgrade.js";

const TOOLS = [
  {
    name: "check_outdated_packages",
    description:
      "Check for outdated packages in the configured Node.js project. Returns a list of packages that have newer versions available with current and latest versions.",
    inputSchema: {
      type: "object",
      properties: {
        packageManager: {
          type: "string",
          enum: ["npm", "yarn", "pnpm"],
          description: "Package manager to use (defaults to npm)",
        },
      },
    },
  },
  {
    name: "check_vulnerabilities",
    description:
      "Check for security vulnerabilities in the configured project dependencies using npm audit or yarn audit. Returns detailed vulnerability information.",
    inputSchema: {
      type: "object",
      properties: {
        packageManager: {
          type: "string",
          enum: ["npm", "yarn", "pnpm"],
          description: "Package manager to use (defaults to npm)",
        },
      },
    },
  },
  {
    name: "analyze_dependencies",
    description:
      "Analyze the configured project dependencies and provide statistics: total count, direct vs transitive dependencies, dependency tree depth, and duplicate packages.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "check_license_compliance",
    description:
      "Check licenses of all dependencies in the configured project and identify any with restrictive licenses (GPL, AGPL, etc.) that might require attention.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "suggest_updates",
    description:
      "Suggest safe dependency updates for the configured project by analyzing semantic versioning and checking for breaking changes. Prioritizes patch and minor updates.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "upgrade_dependencies",
    description:
      "Upgrade outdated dependencies in the configured project to their latest versions. Can upgrade all packages or specific packages. WARNING: modifies package.json and node_modules. Only run with explicit user approval.",
    inputSchema: {
      type: "object",
      properties: {
        packageManager: {
          type: "string",
          enum: ["npm", "yarn", "pnpm"],
          description: "Package manager to use (defaults to npm)",
        },
        packages: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific packages to upgrade. If not provided, all outdated packages will be upgraded.",
        },
        updateType: {
          type: "string",
          enum: ["patch", "minor", "major", "latest"],
          description:
            "Type of updates to apply: patch (bug fixes), minor (new features), major (breaking changes), or latest (all updates). Defaults to latest.",
        },
      },
    },
  },
];

const HANDLERS = {
  check_outdated_packages: checkOutdatedPackages,
  check_vulnerabilities: checkVulnerabilities,
  analyze_dependencies: analyzeDependencies,
  check_license_compliance: checkLicenseCompliance,
  suggest_updates: suggestUpdates,
  upgrade_dependencies: upgradeDependencies,
};

const projectPath = process.argv[2] || process.cwd();

const server = new Server(
  { name: "dependency-health-mcp", version: "1.0.4" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Error: Unknown tool: ${name}` }],
      isError: true,
    };
  }
  try {
    return await handler(args, projectPath);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

server.onerror = (error) => console.error("[MCP Error]", error);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Dependency Health MCP server running on stdio (monitoring: ${projectPath})`);