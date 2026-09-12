import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_FENCE_ACTIVE,
  assertMaintenanceWriteAllowed,
  isMaintenanceWriteBlocked,
} from "./maintenance.js";

const ALLOW_PHASES = ["NORMAL", "NOTICE", "CANCELED"];
const BLOCK_PHASES = [
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "SMOKE",
  "RECOVERING",
  "ABORTING",
  "FAILED",
];

function stateOf(phase, extra = {}) {
  return { phase, ...extra };
}

describe("isMaintenanceWriteBlocked — ALLOW", () => {
  it.each(ALLOW_PHASES)("%s -> false", (phase) => {
    expect(isMaintenanceWriteBlocked(stateOf(phase))).toBe(false);
  });
});

describe("isMaintenanceWriteBlocked — BLOCK", () => {
  it.each(BLOCK_PHASES)("%s -> true", (phase) => {
    expect(isMaintenanceWriteBlocked(stateOf(phase))).toBe(true);
  });
});

describe("isMaintenanceWriteBlocked — UNKNOWN (fail-open)", () => {
  it("null -> false", () => {
    expect(isMaintenanceWriteBlocked(null)).toBe(false);
  });

  it("undefined -> false", () => {
    expect(isMaintenanceWriteBlocked(undefined)).toBe(false);
  });

  it("{} (objeto sem phase) -> false", () => {
    expect(isMaintenanceWriteBlocked({})).toBe(false);
  });

  it("phase desconhecida -> false", () => {
    expect(isMaintenanceWriteBlocked(stateOf("ROTA_INEXISTENTE"))).toBe(false);
  });

  it("phase vazia -> false", () => {
    expect(isMaintenanceWriteBlocked(stateOf(""))).toBe(false);
  });
});

describe("assertMaintenanceWriteAllowed", () => {
  it.each(ALLOW_PHASES)("%s -> não lança", (phase) => {
    expect(() => assertMaintenanceWriteAllowed(stateOf(phase))).not.toThrow();
  });

  it("null / undefined / unknown -> não lança", () => {
    expect(() => assertMaintenanceWriteAllowed(null)).not.toThrow();
    expect(() => assertMaintenanceWriteAllowed(undefined)).not.toThrow();
    expect(() => assertMaintenanceWriteAllowed({})).not.toThrow();
    expect(() => assertMaintenanceWriteAllowed(stateOf("ROTA_INEXISTENTE"))).not.toThrow();
    expect(() => assertMaintenanceWriteAllowed(stateOf(""))).not.toThrow();
  });

  it.each(BLOCK_PHASES)("%s -> lança Error canônico", (phase) => {
    let thrown;
    try {
      assertMaintenanceWriteAllowed(stateOf(phase));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.code).toBe(MAINTENANCE_FENCE_ACTIVE);
    expect(thrown.code).toBe("MAINTENANCE_FENCE_ACTIVE");
    expect(typeof thrown.message).toBe("string");
    expect(thrown.message.trim().length).toBeGreaterThan(0);
  });
});

describe("helpers puros — sem mutação", () => {
  it("não muta o objeto recebido (allow e block)", () => {
    const allow = stateOf("NOTICE", { epoch: 3, extra: "x" });
    const block = stateOf("FENCING", { epoch: 4, extra: "y" });
    const allowSnap = JSON.stringify(allow);
    const blockSnap = JSON.stringify(block);

    expect(isMaintenanceWriteBlocked(allow)).toBe(false);
    expect(() => assertMaintenanceWriteAllowed(allow)).not.toThrow();
    expect(JSON.stringify(allow)).toBe(allowSnap);

    expect(isMaintenanceWriteBlocked(block)).toBe(true);
    expect(() => assertMaintenanceWriteAllowed(block)).toThrow();
    expect(JSON.stringify(block)).toBe(blockSnap);
  });

  it("não muta objeto congelado", () => {
    const frozen = Object.freeze(stateOf("DRAINING", { epoch: 1 }));
    expect(isMaintenanceWriteBlocked(frozen)).toBe(true);
    expect(() => assertMaintenanceWriteAllowed(frozen)).toThrow();
    expect(frozen.phase).toBe("DRAINING");
    expect(frozen.epoch).toBe(1);
  });
});
