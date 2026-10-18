# Task 1 Brief: Scaffolding, Build Pipeline & Mocking Environment

## Goal
Khởi tạo cấu trúc dự án Obsidian Plugin (`obsidian-english-study`) với TypeScript, esbuild, Vitest và bộ mock Obsidian API.

## Requirements
1. **`package.json`**:
   - name: `obsidian-english-study`
   - version: `1.0.0`
   - description: `Personal English study assistant for Obsidian - dictionary lookup, sentence translation, and contextual vocabulary notebook.`
   - main: `main.js`
   - scripts:
     - `"build": "node esbuild.config.mjs"`
     - `"dev": "node esbuild.config.mjs --watch"`
     - `"test": "vitest run"`
   - devDependencies:
     - `obsidian`: `^1.7.2`
     - `typescript`: `^5.4.0`
     - `esbuild`: `^0.21.0`
     - `vitest`: `^1.6.0`
     - `@types/node`: `^20.0.0`
     - `tslib`: `^2.6.0`

2. **`tsconfig.json`**:
   - compilerOptions:
     - `target`: `"ES2018"`
     - `module`: `"CommonJS"`
     - `lib`: `["DOM", "ES2018"]`
     - `moduleResolution`: `"node"`
     - `strict`: `true`
     - `esModuleInterop`: `true`
     - `skipLibCheck`: `true`
     - `baseUrl`: `"."`
     - `paths`: `{ "obsidian": ["__mocks__/obsidian.ts"] }` (cho testing) hoặc để vitest alias xử lý.

3. **`esbuild.config.mjs`**:
   - Build `main.ts` -> `main.js`.
   - `format: "cjs"`, `target: "es2018"`, `bundle: true`, `sourcemap: "inline"`.
   - `external: ["obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr"]`.

4. **`manifest.json`**:
   - `id`: `"obsidian-english-study"`
   - `name`: `"English Study Assistant"`
   - `version`: `"1.0.0"`
   - `minAppVersion`: `"0.15.0"`
   - `description`: `"Personal English learning assistant: dictionary, translation, and vocabulary note manager."`
   - `author`: `"Personal"`
   - `isDesktopOnly`: `false`

5. **`vitest.config.ts`**:
   - alias `"obsidian"` to path `__mocks__/obsidian.ts`.

6. **`__mocks__/obsidian.ts`**:
   - Mock đầy đủ các class/types:
     - `requestUrl`: `vi.fn()`
     - `Notice`: class mock
     - `Plugin`: class mock với `addCommand`, `registerDomEvent`, `registerEvent`, `registerView`, `addSettingTab`, `loadData`, `saveData`
     - `PluginSettingTab`: class mock với `display()`
     - `Setting`: class mock với chainable methods (`setName`, `setDesc`, `addText`, `addDropdown`, `addToggle`, `addButton`)
     - `ItemView`: class mock với `getViewType`, `getDisplayText`, `getIcon`, `onOpen`, `onClose`
     - `TFile`: class mock
     - `Vault`: class mock với `getAbstractFileByPath`, `create`, `modify`, `process`
     - `App`: class mock với `vault`, `workspace`

7. **`src/types/index.ts`**:
   - `LookupResult`, `PluginSettings`, `DEFAULT_SETTINGS`, `DictDefinition`, `VocabFormat`.

8. **`tests/scaffold.test.ts`**:
   - Test kiểm tra types, import Obsidian mock, và vitest configuration.

## Verification
- Chạy `npm install`
- Chạy `npx vitest run` -> All PASS
- Chạy `npm run build` -> Tạo file `main.js` (tạo `main.ts` stub tạm thời nếu cần)
- Commit git sau khi hoàn thành.
