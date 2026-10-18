import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type PluginSettings } from "./src/types/index";

export default class EnglishStudyPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    console.log("English Study Plugin loaded (stub)");
  }

  onunload() {
    console.log("English Study Plugin unloaded (stub)");
  }
}
