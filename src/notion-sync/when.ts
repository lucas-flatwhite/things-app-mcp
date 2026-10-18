export interface ClassifyInput {
  activationDate: string | null;
  projectId: string | null;
  areaId: string | null;
  inInbox: boolean;
  inSomeday: boolean;
  inAnytime: boolean;
  projectIsSomeday: boolean;
  timeZone: string;
  today: string;
}

function dateParts(
  date: Date,
  timeZone: string
): { year: string; month: string; day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  let hour = read("hour");
  if (hour === "24") hour = "00";
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: hour.padStart(2, "0"),
    minute: read("minute").padStart(2, "0"),
  };
}

/** Local calendar date `YYYY-MM-DD` in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Things activation instants become a local date, or a local date and time.
 * Local midnight stays a date, so a UTC instant that is the next midnight in
 * this timezone is that next date.
 */
export function formatActivation(iso: string, timeZone: string): string {
  const parts = dateParts(new Date(iso), timeZone);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour === "00" && parts.minute === "00") return date;
  return `${date} ${parts.hour}:${parts.minute}`;
}

export function whenToThingsParam(value: string): string | null {
  switch (value) {
    case "오늘":
      return "today";
    case "오늘 저녁":
      return "evening";
    case "언제든":
      return "anytime";
    case "언젠가":
      return "someday";
    case "받은함":
      return null;
    default: {
      const match = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2}))?$/.exec(value);
      if (!match) return null;
      if (match[2]) return `${match[1]}@${match[2]}:${match[3]}`;
      return match[1];
    }
  }
}

/** Notion may set When only when the item stays in Today. */
export function isTodayWritableWhen(value: string, todayDate: string): boolean {
  if (value === "오늘" || value === "오늘 저녁") return true;
  const match = /^(\d{4}-\d{2}-\d{2})(?: \d{2}:\d{2})?$/.exec(value);
  if (!match) return false;
  return match[1] <= todayDate;
}

export function classifyWhen(input: ClassifyInput): {
  when: string;
  unclassified: boolean;
} {
  if (input.activationDate) {
    return {
      when: formatActivation(input.activationDate, input.timeZone),
      unclassified: false,
    };
  }
  if (!input.projectId && !input.areaId && input.inInbox) {
    return { when: "받은함", unclassified: false };
  }
  if (input.inSomeday && !input.projectIsSomeday) {
    return { when: "언젠가", unclassified: false };
  }
  if (input.projectIsSomeday || input.inAnytime) {
    return { when: "언제든", unclassified: false };
  }
  return { when: "언제든", unclassified: true };
}
