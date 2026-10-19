import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("styles.css AI Tutor Craft-Grade Token Compliance", () => {
  const cssPath = path.resolve(__dirname, "../../styles.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("should contain all required popover chat drawer selectors", () => {
    expect(cssContent).toContain(".popover-chat-drawer");
    expect(cssContent).toContain(".drawer-toggle-btn");
    expect(cssContent).toContain(".drawer-top-toolbar");
    expect(cssContent).toContain(".drawer-quick-chips");
    expect(cssContent).toContain(".drawer-messages-list");
    expect(cssContent).toContain(".drawer-input-row");
  });

  it("should contain all required sidebar AI tutor selectors", () => {
    expect(cssContent).toContain(".sidebar-tab-btn.tab-btn-ai-tutor");
    expect(cssContent).toContain(".sidebar-ai-tutor-container");
    expect(cssContent).toContain(".sidebar-tutor-empty");
    expect(cssContent).toContain(".sidebar-tutor-header");
    expect(cssContent).toContain(".sidebar-tutor-chips");
    expect(cssContent).toContain(".sidebar-tutor-messages");
    expect(cssContent).toContain(".sidebar-tutor-input-row");
  });

  it("should contain user and model message bubbles and textarea focus styles", () => {
    expect(cssContent).toContain(".tutor-message-user");
    expect(cssContent).toContain(".tutor-message-model");
    expect(cssContent).toContain(".drawer-input-textarea:focus");
    expect(cssContent).toContain(".sidebar-tutor-textarea:focus");
  });

  it("should strictly use Obsidian theme tokens with zero hardcoded colors in the AI Tutor section", () => {
    const aiTutorSectionIndex = cssContent.indexOf("AI Tutor Chat Drawer & Sidebar Tab");
    expect(aiTutorSectionIndex).toBeGreaterThan(0);

    const aiTutorSection = cssContent.substring(aiTutorSectionIndex);

    // Should NOT have any hardcoded hex (#...) or rgba(...) colors in this section
    const hexMatch = aiTutorSection.match(/#[0-9a-fA-F]{3,8}/g);
    expect(hexMatch).toBeNull();

    const rgbMatch = aiTutorSection.match(/rgba?\([^)]+\)/g);
    expect(rgbMatch).toBeNull();

    // Must use Obsidian CSS theme variables
    expect(aiTutorSection).toContain("var(--interactive-accent)");
    expect(aiTutorSection).toContain("var(--text-on-accent)");
    expect(aiTutorSection).toContain("var(--background-secondary)");
    expect(aiTutorSection).toContain("var(--background-primary)");
    expect(aiTutorSection).toContain("var(--background-modifier-border)");
    expect(aiTutorSection).toContain("var(--text-normal)");
    expect(aiTutorSection).toContain("var(--text-muted)");
  });
});
