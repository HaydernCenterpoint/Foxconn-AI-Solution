import { readFile as readFileAsync } from "node:fs/promises";

import type {
  ConnectorConfig,
  CsvConnectorConfig,
  OpcUaConnectorConfig,
  PostgresConnectorConfig,
} from "../config.js";
import { resolveEnvironmentReference } from "../config.js";
import type { ManagedConnector } from "../runner.js";
import { CsvConnector } from "./csv.js";
import { NodeOpcUaReader, OpcUaConnector, type NodeOpcUaReaderOptions } from "./opcua.js";
import { PgPoolSource, PostgresConnector, type PgPoolSourceOptions } from "./postgres.js";

// The open connector framework: the `EdgeConnector` interface in types.ts is the
// plugin contract, and this registry is the only place a connector type must be
// wired in. Adding a connector = one factory function + one `registerConnector` call.

export interface ConnectorFactoryContext {
  environment: NodeJS.ProcessEnv;
  readFile: (path: string) => Promise<string>;
}

export type ConnectorFactory = (config: ConnectorConfig, context: ConnectorFactoryContext) => Promise<ManagedConnector>;

const factories = new Map<string, ConnectorFactory>();

export function registerConnector(type: string, factory: ConnectorFactory): void {
  factories.set(type, factory);
}

export async function buildConnector(config: ConnectorConfig, context: ConnectorFactoryContext): Promise<ManagedConnector> {
  const factory = factories.get(config.type);
  if (!factory) throw new Error(`unregistered connector type '${config.type}'`);
  return factory(config, context);
}

async function csvFactory(config: CsvConnectorConfig): Promise<ManagedConnector> {
  return { sourceSystem: config.sourceSystem, connector: new CsvConnector(config) };
}

async function postgresFactory(config: PostgresConnectorConfig, context: ConnectorFactoryContext): Promise<ManagedConnector> {
  const poolOptions: PgPoolSourceOptions = {
    connectionString: resolveEnvironmentReference(
      context.environment,
      config.connectionStringEnv,
      `PostgreSQL connector '${config.sourceSystem}'`,
    ),
    sourceSystem: config.sourceSystem,
    statementTimeoutMs: config.statementTimeoutMs,
  };
  if (config.ssl) {
    poolOptions.ssl = {
      rejectUnauthorized: config.ssl.rejectUnauthorized,
      ...(config.ssl.caFile ? { ca: await context.readFile(config.ssl.caFile) } : {}),
    };
  }
  const source = new PgPoolSource(poolOptions);
  return { sourceSystem: config.sourceSystem, connector: new PostgresConnector(config, source) };
}

async function opcUaFactory(config: OpcUaConnectorConfig, context: ConnectorFactoryContext): Promise<ManagedConnector> {
  const readerOptions: NodeOpcUaReaderOptions = {
    endpointUrl: config.endpointUrl,
    sourceSystem: config.sourceSystem,
    securityMode: config.securityMode,
    securityPolicy: config.securityPolicy,
    endpointMustExist: config.endpointMustExist,
    connectionTimeoutMs: config.connectionTimeoutMs,
    credentials:
      config.credentials.type === "username"
        ? {
            type: "username",
            username: resolveEnvironmentReference(
              context.environment,
              config.credentials.usernameEnv,
              `OPC-UA username for '${config.sourceSystem}'`,
            ),
            password: resolveEnvironmentReference(
              context.environment,
              config.credentials.passwordEnv,
              `OPC-UA password for '${config.sourceSystem}'`,
            ),
          }
        : { type: "anonymous" },
    ...(config.certificateFile ? { certificateFile: config.certificateFile } : {}),
    ...(config.privateKeyFile ? { privateKeyFile: config.privateKeyFile } : {}),
  };
  return { sourceSystem: config.sourceSystem, connector: new OpcUaConnector(config, new NodeOpcUaReader(readerOptions)) };
}

// The registry key and `config.type` are the same discriminator, so the narrowed
// factories only reach their matching config at runtime.
registerConnector("csv", csvFactory as ConnectorFactory);
registerConnector("postgres", postgresFactory as ConnectorFactory);
registerConnector("opcua", opcUaFactory as ConnectorFactory);

export async function createConnectorContext(environment: NodeJS.ProcessEnv): Promise<ConnectorFactoryContext> {
  return { environment, readFile: (path: string) => readFileAsync(path, "utf8") };
}
