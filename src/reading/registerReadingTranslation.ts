import { MarkdownView, Plugin } from "obsidian";
import type { PluginSettings } from "../types";
import { ReadingTranslationController } from "./ReadingTranslationController";
import { ReadingTranslationService } from "./ReadingTranslationService";

export function registerReadingTranslation(plugin: Plugin, getSettings: () => PluginSettings): ReadingTranslationController {
  const controller = plugin.addChild(new ReadingTranslationController(plugin.app, new ReadingTranslationService(), getSettings));
  plugin.registerMarkdownPostProcessor((el, context) => controller.processSection(el, context));
  plugin.addCommand({
    id: "toggle-reading-translation",
    name: "Bật/tắt dịch song ngữ khi đọc",
    checkCallback: checking => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const available = Boolean(view?.file && view.getMode() === "preview");
      if (!checking && available && view) controller.toggle(view);
      return available;
    },
  });
  return controller;
}
