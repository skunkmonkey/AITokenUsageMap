export const isoDateFromParts = (year: number, month: number, day: number): string | null => {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
};

export const parseDateInput = (value: string): string | null => {
  const trimmed = value.trim();
  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slashDate) {
    return isoDateFromParts(Number(slashDate[3]), Number(slashDate[1]), Number(slashDate[2]));
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDate) {
    return isoDateFromParts(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
  }

  return null;
};

export const formatDateInput = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
};

type NativeDatePickerInput = {
  showPicker?: () => void;
  focus: () => void;
  click: () => void;
};

export const showNativeDatePicker = (input: NativeDatePickerInput | null) => {
  if (!input) return;
  if (input.showPicker) {
    input.showPicker();
  } else {
    input.focus();
    input.click();
  }
};
