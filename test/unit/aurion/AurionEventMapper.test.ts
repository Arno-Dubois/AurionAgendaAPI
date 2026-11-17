import { describe, expect, it } from "vitest";
import { AurionLayoutChangedError } from "../../../src/domain/errors.js";
import {
  AurionEventMapper,
  EXAM_CLASS,
  parseTitle,
} from "../../../src/infrastructure/aurion/AurionEventMapper.js";
import { PartialResponse } from "../../../src/infrastructure/aurion/PartialResponse.js";
import { fixture } from "../../support/fixtures.js";

const mapper = new AurionEventMapper("Europe/Paris");

describe("AurionEventMapper with the recorded week", () => {
  const json = PartialResponse.parse(fixture("planning-events.xml"), "test").update(
    "form:j_idt118",
  );
  const events = mapper.parseScheduleUpdate(json ?? "");

  it("maps every event", () => {
    expect(events).toHaveLength(10);
    expect(new Set(events.map((e) => e.id)).size).toBe(10);
  });

  it("splits the title into room, description, subject, kind and teacher", () => {
    expect(events[0]?.toJSON()).toEqual({
      id: "06b4ba90-5f72-4cca-b4c5-fe673eac7f53",
      start: "2026-11-16T09:00:00.000+01:00",
      end: "2026-11-16T12:00:00.000+01:00",
      title: "Human Aspects of Management",
      room: "BORDEAUX_032_SALLE_CODESIGN",
      description: "annulé sera décalé",
      subject: "Human Aspects of Management",
      kind: "COURS_TD",
      teacher: "Mr TEACHER_A",
      isExam: false,
    });
  });

  it("returns null for empty lines instead of empty strings", () => {
    const association = events.find((e) => e.kind === "ASSOCIATIF");
    expect(association?.subject).toBeNull();
    expect(association?.description).toBeNull();
    expect(association?.room).toBe("J006_BDE");
  });

  it("keeps the timezone of the configuration", () => {
    expect(events.every((e) => e.start.zoneName === "Europe/Paris")).toBe(true);
  });
});

describe("AurionEventMapper with the recorded school year", () => {
  const json = PartialResponse.parse(fixture("planning-year.xml"), "test").update("form:j_idt118");
  const events = mapper.parseScheduleUpdate(json ?? "");

  it("maps every event, on both sides of the DST change", () => {
    expect(events).toHaveLength(292);
    const offsets = new Set(events.map((e) => e.start.offset));
    expect(offsets).toEqual(new Set([60, 120]));
  });

  it("flags exams and keeps their kind label", () => {
    const exams = events.filter((e) => e.isExam);
    expect(exams).toHaveLength(18);
    expect(new Set(exams.map((e) => e.kind))).toEqual(new Set(["EXAM_SURV"]));
  });

  it("keeps multi-line descriptions and still finds subject, kind and teacher", () => {
    const remote = events.find((e) => e.kind === "COURS_TD_DIST");
    expect(remote?.subject).toBe("Innovation Management");
    expect(remote?.teacher).toBe("Mr TEACHER_A");
    expect(remote?.description?.split("\n")).toEqual([
      "En distanciel",
      "Connectez via le module sur JUNIA Learning ou directement via le lien suivant :",
      "https://teams.microsoft.com/l/meetup-join//",
    ]);

    const workshop = events.find((e) => e.kind === "ATELIER");
    expect(workshop?.subject).toBeNull();
    expect(workshop?.title).toBe("OBLIGATOIRE pour ISEN2, ADI2, ISEN4");
    expect(workshop?.description?.split("\n")).toHaveLength(16);
    expect(workshop?.room).toBeNull();
  });

  it("titles events without a subject after their description", () => {
    const welcome = events[0];
    expect(welcome?.subject).toBeNull();
    expect(welcome?.title).toBe("Mot de la directrice");
    expect(welcome?.kind).toBe("PROMO");
  });
});

describe("AurionEventMapper.toDomain", () => {
  const base = {
    id: "1",
    title: "ROOM\n\nSubject\nCM\nMr A",
    start: "2026-03-30T09:00:00+0200",
    end: "2026-03-30T10:00:00+0200",
    allDay: false,
    editable: true,
    className: "CM",
  };

  it("converts to the configured zone, across a DST change", () => {
    const utcMapper = new AurionEventMapper("UTC");
    expect(utcMapper.toDomain(base).start.toISO()).toBe("2026-03-30T07:00:00.000Z");
    expect(mapper.toDomain(base).start.toISO()).toBe("2026-03-30T09:00:00.000+02:00");
  });

  it("defaults a missing end to one day for all-day events", () => {
    const event = mapper.toDomain({ ...base, start: "2026-12-24", end: null, allDay: true });
    expect(event.durationMinutes).toBe(24 * 60);
  });

  it("rejects malformed events with a layout error", () => {
    expect(() => mapper.toDomain({ ...base, start: "yesterday" })).toThrow(
      AurionLayoutChangedError,
    );
    expect(() => mapper.toDomain({ title: "no id or start" })).toThrow(AurionLayoutChangedError);
    expect(() => mapper.parseScheduleUpdate("{not json")).toThrow(/not valid JSON/);
    expect(() => mapper.parseScheduleUpdate('{"items": []}')).toThrow(/no "events" array/);
  });
});

describe("parseTitle", () => {
  it("reads the subject, kind and teacher from the end", () => {
    expect(parseTitle("R\nline 1\nline 2\n\nline 4\nS\nTP\nMr A", "TP")).toEqual({
      room: "R",
      description: "line 1\nline 2\n\nline 4",
      subject: "S",
      kind: "TP",
      teacher: "Mr A",
      isExam: false,
    });
  });

  it("falls back to the class name when the kind line is empty", () => {
    expect(parseTitle("R\n\nS\n\nMr A", "PROMO").kind).toBe("PROMO");
  });

  it("does not use the exam class as a kind", () => {
    expect(parseTitle("R\n\nS\n\nMr A", EXAM_CLASS)).toMatchObject({ kind: null, isExam: true });
  });

  it("keeps unusual short titles as the description", () => {
    expect(parseTitle("Vacances de Noël", "CONGES")).toEqual({
      room: null,
      description: "Vacances de Noël",
      subject: null,
      kind: "CONGES",
      teacher: null,
      isExam: false,
    });
  });
});
