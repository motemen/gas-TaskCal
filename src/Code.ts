const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

// Configurable
const scriptProps = PropertiesService.getScriptProperties().getProperties() as {
  [key: string]: string;
};
const WORKING_HOUR_START = parseInt(scriptProps["WORKING_HOUR_START"] || "11");
const WORKING_HOUR_END = parseInt(scriptProps["WORKING_HOUR_END"] || "17");
const CALENDAR_ID_TASKS = scriptProps["CALENDAR_ID_TASKS"];

export interface TaskObject {
  title: string;
  done: boolean;
  eventId: string;
  calendarId: string;
  startEpochMillis: number;
  endEpochMillis: number;
}

function toTaskObject(event: GoogleAppsScript.Calendar.CalendarEvent): TaskObject {
  let done = false;
  const title = event.getTitle().replace(/^✓\s*/, () => {
    done = true;
    return "";
  });
  return {
    title,
    done,
    eventId: event.getId(),
    calendarId: event.getOriginalCalendarId(),
    startEpochMillis: event.getStartTime().getTime(),
    endEpochMillis: event.getEndTime().getTime()
  };
}

class Timespan {
  public start: Date;
  public end: Date;

  constructor({ start, end }: { start: Date; end: Date }) {
    this.start = start;
    this.end = end;
  }

  setStart(newStart: Date) {
    this.end = new Date(newStart.getTime() + this.end.getTime() - this.start.getTime());
    this.start = newStart;
  }

  overlaps(another: Timespan): boolean {
    if (this.end <= another.start) {
      return false;
    }
    if (another.end <= this.start) {
      return false;
    }

    return true;
  }

  toString(): string {
    return `${this.start} - ${this.end}`;
  }
}

function doGet(e: any) {
  return HtmlService.createHtmlOutputFromFile("index.html")
    .setTitle("TaskCal")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function truncateToHour(date: Date, hour: number, toPast: boolean = false): Date {
  const truncate = (n: number) => (toPast ? Math.ceil(n) : Math.floor(n));
  date = new Date(truncate(date.getTime() / ONE_DAY) * ONE_DAY);
  date.setHours(hour);
  return date;
}

function addDuration(date: Date, duration: number): Date {
  return new Date(date.getTime() + duration);
}

export interface ListTasksResult {
  startEpochMillis: number;
  endEpochMillis: number;
  tasks: TaskObject[];
}

export interface ListTasksArguments {
  startEpochMillis?: number;
  endEpochMillis?: number;
  spanDays?: number;
}

export function listTasks(args?: ListTasksArguments): ListTasksResult {
  const calendarTasks = CalendarApp.getCalendarById(CALENDAR_ID_TASKS);
  let { startEpochMillis, endEpochMillis, spanDays }: ListTasksArguments = {
    ...args
  };

  spanDays = spanDays || 7;

  let start: Date | undefined = undefined;
  let end: Date | undefined = undefined;

  if (startEpochMillis) {
    start = new Date(startEpochMillis);
  }

  if (endEpochMillis) {
    end = new Date(endEpochMillis);
  }

  if (!start && !end) {
    start = truncateToHour(new Date(), 0);
    end = addDuration(start, spanDays * ONE_DAY);
  } else if (!start) {
    start = truncateToHour(addDuration(end!, -spanDays * ONE_DAY), 0, true);
  } else if (!end) {
    end = truncateToHour(addDuration(start!, spanDays * ONE_DAY), 0);
  }

  if (!start || !end) {
    throw new Error("BUG: cannot reach here");
  }

  if (end < start) {
    [start, end] = [end, start];
  }

  const tasks = calendarTasks.getEvents(start, end).map(toTaskObject);

  return {
    startEpochMillis: start.getTime(),
    endEpochMillis: end.getTime(),
    tasks
  };
}

export function rescheduleTask(eventId: string): TaskObject {
  const calendarTasks = CalendarApp.getCalendarById(CALENDAR_ID_TASKS);
  const event = calendarTasks.getEventById(eventId);
  const durationMinutes =
    (event.getEndTime().getTime() - event.getStartTime().getTime()) / ONE_MINUTE;
  const target = scheduleTime(durationMinutes);
  event.setTime(target.start, target.end);
  return toTaskObject(event);
}

export function copyTask(eventId: string): TaskObject {
  const calendarTasks = CalendarApp.getCalendarById(CALENDAR_ID_TASKS);
  const event = calendarTasks.getEventById(eventId);
  const title = event
    .getTitle()
    .replace(/^✓\s*/, "")
    .replace(/(?:\s*\((\d+)\))?$/, (_, n) => ` (${(parseInt(n) || 0) + 1})`);
  const durationMinutes =
    (event.getEndTime().getTime() - event.getStartTime().getTime()) / ONE_MINUTE;
  return createTask(title, durationMinutes, event.getDescription());
}

export function toggleTaskDone(eventId: string, done: boolean) {
  const calendarTasks = CalendarApp.getCalendarById(CALENDAR_ID_TASKS);
  const event = calendarTasks.getEventById(eventId);

  let title = event.getTitle();
  if (done) {
    if (!/^✓\s*/.test(title)) {
      title = `✓ ${title}`;
    }
  } else {
    title = title.replace(/^✓\s*/, "");
  }

  event.setTitle(title);

  return done;
}

export function createTask(
  title: string,
  desiredMinutes: number = 60,
  description: string = ""
): TaskObject {
  const target = scheduleTime(desiredMinutes);
  const calendarTasks = CalendarApp.getCalendarById(CALENDAR_ID_TASKS);
  const event = calendarTasks.createEvent(title, target.start, target.end, {
    description
  });
  return toTaskObject(event);
}

// TODO: "after"
function scheduleTime(desiredMinutes: number = 60): Timespan {
  const scriptProps = PropertiesService.getScriptProperties();
  const CALENDAR_ID_HOLIDAYS = "ja.japanese#holiday@group.v.calendar.google.com";
  const calendar = CalendarApp.getDefaultCalendar();
  const calendarTasks = CalendarApp.getCalendarById(CALENDAR_ID_TASKS);
  const calendarHolidays = CalendarApp.getCalendarById(CALENDAR_ID_HOLIDAYS);

  let start = new Date(Math.ceil(new Date().getTime() / ONE_HOUR) * ONE_HOUR);
  if (start.getHours() < WORKING_HOUR_START) {
    start.setHours(WORKING_HOUR_START);
  }
  if (start.getHours() > WORKING_HOUR_END) {
    start.setDate(start.getDate() + 1);
    start.setHours(WORKING_HOUR_START);
  }

  const target = new Timespan({
    start,
    end: addDuration(start, desiredMinutes * ONE_MINUTE)
  });

  const eventSpans: Timespan[] = Array.prototype.concat.apply(
    [],
    [calendar, calendarTasks, calendarHolidays].map(c =>
      c.getEvents(start, addDuration(start, 7 * ONE_DAY)).map(
        event =>
          new Timespan({
            start: event.getStartTime(),
            end: event.getEndTime()
          })
      )
    )
  );

  for (
    let date = truncateToHour(target.start, 0);
    truncateToHour(date, 0) <= addDuration(target.end, 7 * ONE_DAY);
    date = addDuration(date, ONE_DAY)
  ) {
    if (date.getDay() === 0 /* Sunday */ || date.getDay() === 6 /* Saturday */) {
      eventSpans.push(
        new Timespan({
          start: addDuration(date, (WORKING_HOUR_END - 24) * ONE_HOUR),
          end: addDuration(date, WORKING_HOUR_START * ONE_HOUR + ONE_DAY)
        })
      );
    } else {
      eventSpans.push(
        new Timespan({
          start: addDuration(date, (WORKING_HOUR_END - 24) * ONE_HOUR),
          end: addDuration(date, WORKING_HOUR_START * ONE_HOUR)
        })
      );
    }
  }

  eventSpans.sort((a, b) => {
    const compare = (n: Date, m: Date) => (n < m ? -1 : n > m ? +1 : 0);
    return compare(a.start, b.start) || compare(a.end, b.end);
  });

  for (const sp of eventSpans) {
    if (target.overlaps(sp)) {
      target.setStart(sp.end);
    }
  }

  return target;
}
