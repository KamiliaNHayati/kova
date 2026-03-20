import { describe, expect, it } from "vitest";
import {
    createWallet,
    setLimits,
    registerService,
} from "../lib/contracts";

// ═══════════════════════════════════════════════
// Frontend Input Validation Tests
// These test the client-side validation layer in contracts.ts
// They verify that invalid inputs throw BEFORE reaching the contract
// ═══════════════════════════════════════════════

describe("createWallet validation", () => {
    it("rejects empty agent address", () => {
        expect(() => createWallet("", 1000, 100)).toThrow("Agent address is required");
    });

    it("rejects whitespace-only agent address", () => {
        expect(() => createWallet("   ", 1000, 100)).toThrow("Agent address is required");
    });

    it("rejects zero daily limit", () => {
        expect(() => createWallet("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", 0, 100)).toThrow("Daily limit must be greater than 0");
    });

    it("rejects negative daily limit", () => {
        expect(() => createWallet("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", -1, 100)).toThrow("Daily limit must be greater than 0");
    });

    it("rejects zero per-call limit", () => {
        expect(() => createWallet("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", 1000, 0)).toThrow("Per-call limit must be greater than 0");
    });

    it("rejects per-call limit > daily limit", () => {
        expect(() => createWallet("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", 100, 200)).toThrow("Per-call limit cannot exceed daily limit");
    });
});

describe("setLimits validation", () => {
    it("rejects zero daily limit", () => {
        expect(() => setLimits("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", 0, 100)).toThrow("Daily limit must be greater than 0");
    });

    it("rejects zero per-call limit", () => {
        expect(() => setLimits("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", 1000, 0)).toThrow("Per-call limit must be greater than 0");
    });

    it("rejects per-call > daily", () => {
        expect(() => setLimits("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", 100, 200)).toThrow("Per-call limit cannot exceed daily limit");
    });
});

describe("registerService validation", () => {
    const mockAddr = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

    it("rejects empty name", () => {
        expect(() => registerService("", "desc", "https://a.com", 10, mockAddr)).toThrow("Service name is required");
    });

    it("rejects whitespace-only name", () => {
        expect(() => registerService("   ", "desc", "https://a.com", 10, mockAddr)).toThrow("Service name is required");
    });

    it("rejects empty URL", () => {
        expect(() => registerService("svc", "desc", "", 10, mockAddr)).toThrow("Service URL is required");
    });

    it("rejects zero price", () => {
        expect(() => registerService("svc", "desc", "https://a.com", 0, mockAddr)).toThrow("Price per call must be greater than 0");
    });

    it("rejects negative price", () => {
        expect(() => registerService("svc", "desc", "https://a.com", -5, mockAddr)).toThrow("Price per call must be greater than 0");
    });

    it("rejects empty payment address", () => {
        expect(() => registerService("svc", "desc", "https://a.com", 10, "")).toThrow("Payment address is required");
    });
});
