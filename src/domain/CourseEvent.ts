import type { DateTime } from "luxon";

export interface CourseEventProps {
  /** Stable identifier from Aurion (a UUID). Usable as an iCal UID. */
  id: string;
  start: DateTime<true>;
  end: DateTime<true>;
  /** Course / module name, e.g. "Human Aspects of Management". Empty for meetings, talks… */
  subject: string | null;
  /**
   * Free text written by the school, possibly on several lines: "annulé sera décalé",
   * "Mot de la directrice", a Teams link, an address… Often empty for regular classes.
   */
  description: string | null;
  /** Raw room code, e.g. "BORDEAUX_032_SALLE_CODESIGN". */
  room: string | null;
  /** Kind of session as Aurion labels it: "COURS_TD", "TP", "PROJET", "EXAM_SURV"… */
  kind: string | null;
  /** The teacher Aurion shows in the calendar (only one, even when there are several). */
  teacher: string | null;
  /** Aurion flags exams with a dedicated CSS class. */
  isExam: boolean;
}

/** One slot in the timetable. Independent of how it was fetched. */
export class CourseEvent {
  readonly id: string;
  readonly start: DateTime<true>;
  readonly end: DateTime<true>;
  readonly subject: string | null;
  readonly description: string | null;
  readonly room: string | null;
  readonly kind: string | null;
  readonly teacher: string | null;
  readonly isExam: boolean;

  constructor(props: CourseEventProps) {
    if (props.end < props.start) {
      throw new RangeError(`Event ${props.id} ends before it starts.`);
    }
    this.id = props.id;
    this.start = props.start;
    this.end = props.end;
    this.subject = props.subject;
    this.description = props.description;
    this.room = props.room;
    this.kind = props.kind;
    this.teacher = props.teacher;
    this.isExam = props.isExam;
    Object.freeze(this);
  }

  /**
   * What a calendar should display: the subject, or for events without one (meetings,
   * talks, workshops) the first line of the description.
   */
  get title(): string {
    const firstLine = this.description?.split("\n", 1)[0];
    return this.subject ?? firstLine ?? this.kind ?? "Untitled event";
  }

  get durationMinutes(): number {
    return this.end.diff(this.start, "minutes").minutes;
  }

  /** True while `instant` is inside the event (start inclusive, end exclusive). */
  isOngoingAt(instant: DateTime): boolean {
    return this.start <= instant && instant < this.end;
  }

  toJSON() {
    return {
      id: this.id,
      start: this.start.toISO(),
      end: this.end.toISO(),
      title: this.title,
      subject: this.subject,
      description: this.description,
      room: this.room,
      kind: this.kind,
      teacher: this.teacher,
      isExam: this.isExam,
    };
  }
}
