import type { PlainMessageKey } from "@xiaoban/i18n";
import type { ErrorCode, FailureKind, ProviderId } from "@xiaoban/protocol";
import { type ConnectionStatus, HubRequestError } from "./client.ts";

const FAILURE_KEYS = {
  model: "failure-model",
  not_configured: "failure-not-configured",
  invalid_key: "failure-invalid-key",
  unknown_model: "failure-unknown-model",
  invalid_endpoint: "failure-invalid-endpoint",
  network: "failure-network",
  cancelled: "failure-cancelled",
  budget: "failure-budget",
  internal: "failure-internal",
} as const satisfies Record<FailureKind, PlainMessageKey>;

const ERROR_KEYS = {
  unsupported_protocol: "error-unsupported-protocol",
  unauthorized: "error-unauthorized",
  bad_request: "error-bad-request",
  not_found: "error-not-found",
  busy: "error-busy",
  internal: "error-internal",
} as const satisfies Record<ErrorCode, PlainMessageKey>;

const CONNECTION_KEYS = {
  idle: "connection-idle",
  connecting: "connection-connecting",
  open: "connection-open",
  reconnecting: "connection-reconnecting",
  closed: "connection-closed",
} as const satisfies Record<ConnectionStatus, PlainMessageKey>;

const PROVIDER_KEYS = {
  deepseek: "provider-deepseek",
  mimo: "provider-mimo",
  custom: "provider-custom",
} as const satisfies Record<ProviderId, PlainMessageKey>;

export function providerKey(id: ProviderId): PlainMessageKey {
  return PROVIDER_KEYS[id];
}

export function failureKey(kind: FailureKind): PlainMessageKey {
  return FAILURE_KEYS[kind];
}

export function connectionKey(status: ConnectionStatus): PlainMessageKey {
  return CONNECTION_KEYS[status];
}

export function describeError(error: unknown): PlainMessageKey {
  return error instanceof HubRequestError ? ERROR_KEYS[error.code] : "error-unreachable";
}
