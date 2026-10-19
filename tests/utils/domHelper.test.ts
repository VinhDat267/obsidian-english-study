import { describe, it, expect } from "vitest";
import {
  calculatePosition,
  PositionResult,
  RectLike,
  safeSetIcon,
} from "../../src/utils/domHelper";
import { createMockObsidianElement } from "../../__mocks__/obsidian";

describe("domHelper - calculatePosition", () => {
  const popoverWidth = 300;
  const popoverHeight = 200;
  const vw = 1024;
  const vh = 768;

  it("should position popover directly below selection with default margin (8px)", () => {
    const selectionRect: RectLike = {
      top: 100,
      bottom: 120,
      left: 150,
      right: 250,
      width: 100,
      height: 20,
    };

    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      vh
    );

    expect(pos.top).toBe(128); // 120 + 8
    expect(pos.left).toBe(150);
    expect(pos.flipped).toBe(false);
  });

  it("should respect custom margin parameter", () => {
    const selectionRect: RectLike = {
      top: 100,
      bottom: 120,
      left: 150,
      right: 250,
    };
    const customMargin = 16;

    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      vh,
      customMargin
    );

    expect(pos.top).toBe(136); // 120 + 16
    expect(pos.left).toBe(150);
    expect(pos.flipped).toBe(false);
  });

  it("should flip above selection when overflowing bottom of viewport", () => {
    // 600 + 200 + 8 = 808 > 768 (vh) -> overflows bottom
    const selectionRect: RectLike = {
      top: 580,
      bottom: 600,
      left: 200,
      right: 300,
    };

    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      vh
    );

    expect(pos.flipped).toBe(true);
    expect(pos.top).toBe(372); // 580 - 200 - 8
    expect(pos.left).toBe(200);
  });

  it("should shift left when overflowing right edge of viewport", () => {
    // 800 + 300 + 8 = 1108 > 1024 (vw) -> overflows right
    const selectionRect: RectLike = {
      top: 100,
      bottom: 120,
      left: 800,
      right: 900,
    };

    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      vh
    );

    // Expected left = vw - popoverWidth - margin = 1024 - 300 - 8 = 716
    expect(pos.left).toBe(716);
    expect(pos.top).toBe(128);
    expect(pos.flipped).toBe(false);
  });

  it("should both flip up and shift left when near bottom-right corner", () => {
    const selectionRect: RectLike = {
      top: 650,
      bottom: 670,
      left: 850,
      right: 950,
    };

    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      vh
    );

    expect(pos.flipped).toBe(true);
    expect(pos.top).toBe(442); // 650 - 200 - 8
    expect(pos.left).toBe(716); // 1024 - 300 - 8
  });

  it("should clamp left to margin when selection is at or past left edge", () => {
    const selectionRect: RectLike = {
      top: 100,
      bottom: 120,
      left: -20,
      right: 50,
    };

    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      vh
    );

    expect(pos.left).toBe(8); // clamped to default margin 8
    expect(pos.top).toBe(128);
    expect(pos.flipped).toBe(false);
  });

  it("should clamp left to custom margin if selectionRect.left < margin", () => {
    const selectionRect: RectLike = {
      top: 100,
      bottom: 120,
      left: 5,
      right: 50,
    };

    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      vh,
      12
    );

    expect(pos.left).toBe(12);
  });

  it("should clamp top to margin if flipped position goes above viewport", () => {
    // When viewport height is small, rect is near bottom so it flips, but top is also near top
    const selectionRect: RectLike = {
      top: 50,
      bottom: 180,
      left: 100,
      right: 200,
    };
    // 180 + 200 + 8 = 388 > 250 (vh) -> flips
    // flipped top: 50 - 200 - 8 = -158 < margin -> clamped to 8
    const pos: PositionResult = calculatePosition(
      selectionRect,
      popoverWidth,
      popoverHeight,
      vw,
      250
    );

    expect(pos.flipped).toBe(true);
    expect(pos.top).toBe(8);
  });
});

describe("domHelper - safeSetIcon (Taste Skill compliant)", () => {
  it("renders SVG fallback with lucide icon class without emoji", () => {
    const el = createMockObsidianElement("button");
    safeSetIcon(el, "volume-2", "Phát âm");

    expect(el.getAttribute("aria-label")).toBe("Phát âm");
    expect(el.innerHTML).toContain("lucide-volume-2");
    expect(el.innerHTML).toContain("<svg");
    expect(el.innerHTML).not.toContain("🔊"); /* taste-skill-ignore: verifying emoji is absent */
  });

  it("handles empty or missing element gracefully without throwing", () => {
    expect(() => {
      // @ts-ignore
      safeSetIcon(null as any, "x");
    }).not.toThrow();
  });
});
