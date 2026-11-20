import { describe, expect, it } from "vitest";
import { getChainId } from "./networks";

describe("getChainId", () => {
  it("maps plain names", () => {
    expect(getChainId("Ethereum")).toBe(1);
    expect(getChainId("Base")).toBe(8453);
    expect(getChainId("sepolia")).toBe(11155111);
    expect(getChainId("Base Sepolia")).toBe(84532);
  });

  it("maps BridgeKit-style underscored names (initiate payloads)", () => {
    expect(getChainId("Ethereum_Sepolia")).toBe(11155111);
    expect(getChainId("Base_Sepolia")).toBe(84532);
  });

  it("is case- and separator-insensitive", () => {
    expect(getChainId("ethereum sepolia")).toBe(11155111);
    expect(getChainId("BASE_SEPOLIA")).toBe(84532);
    expect(getChainId("base sepolia")).toBe(84532);
  });

  it("returns undefined for unknown chains", () => {
    expect(getChainId("Dogechain")).toBeUndefined();
  });
});
