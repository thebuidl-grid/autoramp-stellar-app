import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import {
  DEPOSIT_FOR_BURN_WITH_HOOK_ABI,
  STELLAR_CCTP_DOMAIN,
  STELLAR_CCTP_FORWARDER,
  buildForwarderHookData,
  contractStrkeyToBytes32,
} from "./cctp-stellar";

// Calldata of a REAL, successful Ethereum Sepolia -> Stellar testnet transfer:
//   burn   0xf0d5c01a3e82860cba694bbde76f5b1cb74a0bc5a82a66fad351edc9f4730ce2
//   mint   1bb44fc6f4e5ee9a7427d3506ea4e1f9ab809ed99a597841935104289a248aa7 (Stellar testnet)
const BURN_INPUT = "0x779b432d00000000000000000000000000000000000000000000000000000000004c4b40000000000000000000000000000000000000000000000000000000000000001b3de86ac50b47eaf2840fe23e48179551660fd1072fba6f445d4a6bd7af4ab93e0000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c72383de86ac50b47eaf2840fe23e48179551660fd1072fba6f445d4a6bd7af4ab93e000000000000000000000000000000000000000000000000000000000000138800000000000000000000000000000000000000000000000000000000000003e80000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000005800000000000000000000000000000000000000000000000000000000000000384744424637354536344658424d5657484a434c56524644334e5432524f56344349423533463347323649444f34574e4d34514d4a344c45420000000000000000" as `0x${string}`;
const RECIPIENT = "GDBF75E64FXBMVWHJCLVRFD3NT2ROV4CIB53F3G26IDO4WNM4QMJ4LEB";

describe("CCTP -> Stellar helpers match the on-chain transfer", () => {
  const { args } = decodeFunctionData({ abi: DEPOSIT_FOR_BURN_WITH_HOOK_ABI, data: BURN_INPUT });
  const [, destinationDomain, mintRecipient, , destinationCaller, , , hookData] = args;

  it("targets Stellar's CCTP domain", () => {
    expect(destinationDomain).toBe(STELLAR_CCTP_DOMAIN);
  });
  it("encodes the forwarder as mintRecipient and destinationCaller", () => {
    const fwd = contractStrkeyToBytes32(STELLAR_CCTP_FORWARDER.testnet);
    expect(mintRecipient).toBe(fwd);
    expect(destinationCaller).toBe(fwd);
  });
  it("builds byte-identical hook data", () => {
    expect(buildForwarderHookData(RECIPIENT)).toBe(hookData);
  });
  it("rejects non-account recipients", () => {
    expect(() => buildForwarderHookData("not-an-address")).toThrow();
    expect(() => buildForwarderHookData(STELLAR_CCTP_FORWARDER.testnet)).toThrow();
  });
});

import { evmAddressToBytes32 } from "./cctp-stellar";
import { explorerTxUrl } from "./explorers";

describe("Stellar as a CCTP source", () => {
  // Verified in plain Node (the jsdom test env breaks the XDR library's byte-array checks):
  //   new Asset("USDC", STELLAR_USDC_ISSUER.testnet).contractId(Networks.TESTNET)
  //   === "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"  (Circle's burn token, seen on-chain)
  it("left-pads an EVM address to bytes32", () => {
    const b = evmAddressToBytes32("0x6d07c4f69578DF665b21d1296aF2D3D482F4D819");
    expect(b.length).toBe(32);
    expect(b.subarray(0, 12).every((x) => x === 0)).toBe(true);
    expect(b.subarray(12).toString("hex")).toBe("6d07c4f69578df665b21d1296af2d3d482f4d819");
    expect(() => evmAddressToBytes32("0x123")).toThrow();
  });
});

describe("explorerTxUrl", () => {
  it("maps each bridge chain to its explorer", () => {
    expect(explorerTxUrl("Base_Sepolia", "0xabc")).toBe("https://sepolia.basescan.org/tx/0xabc");
    expect(explorerTxUrl("Base", "0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerTxUrl("Ethereum_Sepolia", "0xabc")).toBe("https://sepolia.etherscan.io/tx/0xabc");
    expect(explorerTxUrl("Stellar_Testnet", "ff")).toBe("https://stellar.expert/explorer/testnet/tx/ff");
    expect(explorerTxUrl("Stellar", "ff")).toBe("https://stellar.expert/explorer/public/tx/ff");
    expect(explorerTxUrl("Mystery", "ff")).toBeNull();
  });
});
