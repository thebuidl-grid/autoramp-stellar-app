import { describe, expect, it } from "vitest";
import { extractStepHashes } from "./use-bridge";

const APPROVE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BURN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MINT = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("extractStepHashes", () => {
  it("takes the burn as source and the mint as destination", () => {
    const { sourceTxHash, destinationTxHash, failed } = extractStepHashes({
      steps: [
        { name: "approve", state: "success", txHash: APPROVE },
        { name: "burn", state: "success", txHash: BURN },
        { name: "mint", state: "success", txHash: MINT },
      ],
    });
    expect(sourceTxHash).toBe(BURN);
    expect(destinationTxHash).toBe(MINT);
    expect(failed).toBeUndefined();
  });

  it("falls back to the last non-mint tx when there is no burn step", () => {
    const { sourceTxHash, destinationTxHash } = extractStepHashes({
      steps: [
        { name: "approve", state: "success", txHash: APPROVE },
        { name: "mint", state: "success", txHash: MINT },
      ],
    });
    expect(sourceTxHash).toBe(APPROVE);
    expect(destinationTxHash).toBe(MINT);
  });

  it("returns undefined hashes for step lists without tx hashes", () => {
    const { sourceTxHash, destinationTxHash, failed } = extractStepHashes({
      steps: [
        { name: "burn", state: "pending" },
        { name: "mint", state: "pending" },
      ],
    });
    expect(sourceTxHash).toBeUndefined();
    expect(destinationTxHash).toBeUndefined();
    expect(failed).toBeUndefined();
  });

  it("surfaces the failed step", () => {
    const { failed } = extractStepHashes({
      steps: [
        { name: "burn", state: "success", txHash: BURN },
        {
          name: "mint",
          state: "error",
          errorMessage: "attestation expired",
        },
      ],
    });
    expect(failed?.name).toBe("mint");
    expect(failed?.errorMessage).toBe("attestation expired");
  });
});
