import { describe, expect, it, vi } from "vitest";
import { formatDateInput, isoDateFromParts, parseDateInput, showNativeDatePicker } from "./dateInput";

describe("date input helpers", () => {
  it("formats ISO dates for the visible date inputs", () => {
    expect(formatDateInput("2026-06-08")).toBe("6/8/2026");
    expect(formatDateInput("2026-12-31")).toBe("12/31/2026");
  });

  it("accepts typed US slash dates and native ISO date values", () => {
    expect(parseDateInput("6/8/2026")).toBe("2026-06-08");
    expect(parseDateInput("06/08/2026")).toBe("2026-06-08");
    expect(parseDateInput("2026-06-08")).toBe("2026-06-08");
  });

  it("rejects invalid dates instead of normalizing them", () => {
    expect(isoDateFromParts(2026, 2, 29)).toBeNull();
    expect(parseDateInput("2/29/2026")).toBeNull();
    expect(parseDateInput("13/1/2026")).toBeNull();
    expect(parseDateInput("2026-02-31")).toBeNull();
    expect(parseDateInput("June 8, 2026")).toBeNull();
  });

  it("uses showPicker when the browser exposes the native picker API", () => {
    const input = {
      showPicker: vi.fn(),
      focus: vi.fn(),
      click: vi.fn()
    };

    showNativeDatePicker(input);

    expect(input.showPicker).toHaveBeenCalledOnce();
    expect(input.focus).not.toHaveBeenCalled();
    expect(input.click).not.toHaveBeenCalled();
  });

  it("falls back to focus and click when showPicker is unavailable", () => {
    const input = {
      focus: vi.fn(),
      click: vi.fn()
    };

    showNativeDatePicker(input);

    expect(input.focus).toHaveBeenCalledOnce();
    expect(input.click).toHaveBeenCalledOnce();
  });
});
