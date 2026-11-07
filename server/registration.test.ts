import { describe, expect, it } from "vitest";
import type { Payment, Registration } from "@shared/championship";
import { buildDemoChampionship } from "./seed";
import { ChampionshipValidationError, validateAndPropagateState } from "./championship";
import {
  confirmUnpaidRegistrationsForFreeCompetition,
  registrationStatusForFee,
} from "./routers";

const registration = (): Registration => ({
  id: "registration-test-1",
  code: "SCP-00001",
  teamName: "Equipe Teste",
  shortName: "TST",
  logoUrl: "",
  teamDiscord: "",
  captainName: "Capitão Teste",
  captainDiscord: "capitao",
  captainUserId: "discord-user-1",
  players: [{ id: "registration-player-1", name: "Jogador Teste", discord: "", nickname: "Teste", isCaptain: true, isReserve: false }],
  acceptedRules: true,
  acceptedFinancial: true,
  responsible: true,
  status: "proof_submitted",
  paymentDeadline: "2026-11-14",
  notes: "",
  createdAt: "2026-11-06T12:00:00.000Z",
  updatedAt: "2026-11-06T12:00:00.000Z",
  history: [{ id: "registration-history-1", status: "received", note: "Recebida", createdAt: "2026-11-06T12:00:00.000Z", actorName: "Sistema" }],
});

const payment = (registrationId: string): Payment => ({
  id: "payment-test-1",
  registrationId,
  status: "submitted",
  proofUrl: "/local-storage/championship/payments/test.png",
  proofName: "test.png",
  submittedAt: "2026-11-06T12:00:00.000Z",
  reviewedAt: "",
  reviewedBy: "",
  note: "",
});

describe("registration aggregate", () => {
  it("confirms free registrations without requiring payment", () => {
    expect(registrationStatusForFee(0)).toBe("confirmed");
    expect(registrationStatusForFee(25)).toBe("awaiting_payment");
  });

  it("confirms outstanding registrations when the competition becomes free", () => {
    const state = buildDemoChampionship();
    state.config.entryFee = 0;
    state.registrations = [registration()];

    const updated = confirmUnpaidRegistrationsForFreeCompetition(
      state,
      "Organização"
    );

    expect(updated.registrations?.[0]).toMatchObject({
      status: "confirmed",
      paymentDeadline: "",
    });
    expect(updated.registrations?.[0]?.history.at(-1)).toMatchObject({
      status: "confirmed",
      actorName: "Organização",
    });
  });

  it("accepts a registration without a payment deadline", () => {
    const state = buildDemoChampionship();
    state.config.paymentDeadline = "";
    state.registrations = [{ ...registration(), paymentDeadline: "" }];

    const normalized = validateAndPropagateState(state);

    expect(normalized.config.paymentDeadline).toBe("");
    expect(normalized.registrations?.[0]?.paymentDeadline).toBe("");
  });

  it("accepts a registration and a payment linked to it", () => {
    const state = buildDemoChampionship();
    state.registrations = [registration()];
    state.payments = [payment("registration-test-1")];
    const normalized = validateAndPropagateState(state);
    expect(normalized.registrations).toHaveLength(1);
    expect(normalized.payments?.[0]?.registrationId).toBe("registration-test-1");
  });

  it("rejects a payment that references an unknown registration", () => {
    const state = buildDemoChampionship();
    state.payments = [payment("registration-missing")];
    expect(() => validateAndPropagateState(state)).toThrow(ChampionshipValidationError);
  });

  it("rejects duplicate registration codes", () => {
    const state = buildDemoChampionship();
    state.registrations = [registration(), { ...registration(), id: "registration-test-2" }];
    expect(() => validateAndPropagateState(state)).toThrow(/código de inscrição repetido/);
  });
});
