export const COMPILER_VERSION = 1;
export const GRAPH_SCHEMA_VERSION = 2;
export const MAX_GRAPH_BYTES = 1_048_576;
export const MAX_NODES = 100;
export const MAX_EDGES = 200;
export const MAX_CONDITION_LEAVES = 100;
export const MAX_CONDITION_DEPTH = 8;

export const PORTS = {
  trigger: ["next"],
  condition: ["true", "false"],
  action: ["success", "error"],
  delay: ["elapsed"],
  approval: ["approved", "rejected", "expired"],
  wait: ["matched", "expired", "completed", "declined", "cancelled"],
  end: [],
} as const;

export const REQUIRED_PORTS = {
  trigger: ["next"],
  condition: ["true", "false"],
  action: ["success"],
  delay: ["elapsed"],
  approval: ["approved", "rejected", "expired"],
  wait: ["matched", "expired"],
  end: [],
} as const;
