export const toLocalDate = (timestamp: string | Date, timezone: string): string => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

export const addDays = (date: string, days: number): string => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

export const startOfWeek = (date: string): string => {
  const current = new Date(`${date}T00:00:00.000Z`);
  const day = current.getUTCDay();
  current.setUTCDate(current.getUTCDate() - day);
  return current.toISOString().slice(0, 10);
};

export const todayInZone = (timezone: string): string => toLocalDate(new Date(), timezone);
