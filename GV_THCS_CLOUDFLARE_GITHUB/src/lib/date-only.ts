import { addDays, format, isValid, parseISO, startOfWeek } from "date-fns";

export function dateOnlyFromDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function todayDateOnly() {
  return dateOnlyFromDate(new Date());
}

export function parseDateOnly(value: string) {
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export function addDaysDateOnly(value: string, days: number) {
  const parsed = parseDateOnly(value);
  return parsed ? dateOnlyFromDate(addDays(parsed, days)) : "";
}

export function currentWeekStartDateOnly() {
  return dateOnlyFromDate(startOfWeek(new Date(), { weekStartsOn: 1 }));
}

export function normalizeWeekStartDateOnly(value: string) {
  const parsed = parseDateOnly(value);
  return dateOnlyFromDate(startOfWeek(parsed ?? new Date(), { weekStartsOn: 1 }));
}
