import { inspect } from "node:util";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { CourseEvent, type CourseEventProps } from "../../../src/domain/CourseEvent.js";
import { Credentials } from "../../../src/domain/Credentials.js";

const at = (iso: string) => DateTime.fromISO(iso, { zone: "Europe/Paris" }) as DateTime<true>;

const props: CourseEventProps = {
  id: "06b4ba90-5f72-4cca-b4c5-fe673eac7f53",
  start: at("2026-11-16T09:00"),
  end: at("2026-11-16T12:00"),
  subject: "Human Aspects of Management",
  description: null,
  room: "BORDEAUX_032_SALLE_CODESIGN",
  kind: "COURS_TD",
  teacher: "Mr TEACHER_A",
  isExam: false,
};

describe("CourseEvent", () => {
  it("computes its duration and whether it is ongoing", () => {
    const event = new CourseEvent(props);
    expect(event.durationMinutes).toBe(180);
    expect(event.isOngoingAt(at("2026-11-16T09:00"))).toBe(true);
    expect(event.isOngoingAt(at("2026-11-16T11:59"))).toBe(true);
    expect(event.isOngoingAt(at("2026-11-16T12:00"))).toBe(false);
  });

  it("serialises to plain JSON with ISO dates and offsets", () => {
    expect(JSON.parse(JSON.stringify(new CourseEvent(props)))).toEqual({
      id: props.id,
      start: "2026-11-16T09:00:00.000+01:00",
      end: "2026-11-16T12:00:00.000+01:00",
      title: "Human Aspects of Management",
      subject: "Human Aspects of Management",
      description: null,
      room: "BORDEAUX_032_SALLE_CODESIGN",
      kind: "COURS_TD",
      teacher: "Mr TEACHER_A",
      isExam: false,
    });
  });

  it("uses the first description line as title when there is no subject", () => {
    const talk = new CourseEvent({
      ...props,
      subject: null,
      description: "Mot de la directrice\nAmphi J206",
      kind: "PROMO",
    });
    expect(talk.title).toBe("Mot de la directrice");
    expect(new CourseEvent({ ...props, subject: null }).title).toBe("COURS_TD");
    expect(new CourseEvent({ ...props, subject: null, kind: null }).title).toBe("Untitled event");
  });

  it("is immutable", () => {
    expect(Object.isFrozen(new CourseEvent(props))).toBe(true);
  });

  it("rejects an event that ends before it starts", () => {
    expect(() => new CourseEvent({ ...props, end: at("2026-11-16T08:00") })).toThrow(RangeError);
  });
});

describe("Credentials", () => {
  const credentials = new Credentials("jane.doe", "s3cret!");

  it("exposes the password only on explicit request", () => {
    expect(credentials.revealPassword()).toBe("s3cret!");
  });

  it.each([
    ["JSON.stringify", () => JSON.stringify(credentials)],
    ["String()", () => String(credentials)],
    ["console.log / util.inspect", () => inspect(credentials)],
    ["nested inspect", () => inspect({ config: { credentials } }, { depth: 5 })],
  ])("never leaks the password through %s", (_name, render) => {
    const output = render();
    expect(output).not.toContain("s3cret!");
    expect(output).toContain("jane.doe");
  });

  it("rejects empty values", () => {
    expect(() => new Credentials(" ", "x")).toThrow(TypeError);
    expect(() => new Credentials("jane", "")).toThrow(TypeError);
  });
});
