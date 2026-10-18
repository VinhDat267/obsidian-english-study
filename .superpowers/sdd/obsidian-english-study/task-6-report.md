# Task 6 Report: Storage Layer — Vault Vocabulary Service

## Summary
Successfully implemented `src/services/storage/VocabService.ts` responsible for atomic, resilient vocabulary storage in the Obsidian Vault (`Vocabulary.md` or Daily Notes), following strict Test-Driven Development (TDD).

## Implemented Modules

### 1. `src/services/storage/VocabService.ts`
- **Class**: `VocabService`
- **Capabilities**:
  - `updateSettings(settings: PluginSettings): void`:
    - Dynamically updates active service settings.
  - `getResolvedFilePath(settingsOverride?: PluginSettings): string`:
    - When `useDailyNote = true`:
      - Resolves today's date formatted as `YYYY-MM-DD.md`.
      - Inspects Obsidian core `daily-notes` plugin configuration (e.g. `options.folder`) if available.
      - Checks if root `YYYY-MM-DD.md` exists.
      - Defaults cleanly to `Daily Notes/YYYY-MM-DD.md`.
    - When `useDailyNote = false`:
      - Resolves `settings.vocabFilePath` (defaults to `Vocabulary.md`).
      - Safely normalizes paths and enforces `.md` extension.
  - `saveVocab(result: LookupResult, settingsOverride?: PluginSettings): Promise<SaveVocabResult>`:
    - Resolves target path dynamically based on effective settings.
    - Ensures all nested parent directories exist before writing (calls `app.vault.createFolder` recursively).
    - Checks file existence with `app.vault.getAbstractFileByPath`.
    - Creates note with `getDefaultTemplate()` when `vocabFormat = 'table'` or empty note when `vocabFormat = 'callout'`.
    - **Atomic write**: Performs `await app.vault.process(file, callback)` where the callback is **100% synchronous** (no Promises, no `await`, zero async overhead).
    - **Duplicate Detection**: Uses `isWordInContent(content, result.query)`:
      - If duplicate in table format: calls `appendContextToExisting(content, result)` to append the new context sentence with `<br>• ` without adding duplicate rows.
      - If new in table format: calls `insertRowAtTableEnd(content, formatTableRow(result, highlightWordInContext))`, preserving any subheadings and content below the table.
      - If new in callout format: appends `formatCallout(result)` separated by blank lines.
    - **User Feedback**:
      - Displays `Notice("Từ '${result.query}' đã có trong sổ. Đã bổ sung thêm ngữ cảnh mới!")` for duplicates.
      - Displays `Notice("✅ Đã lưu '${result.query}' vào sổ từ vựng!")` for new words.
    - **Fail-Safe Resilience**:
      - Wraps vault operations in `try/catch`. On error (e.g. file locked or invalid file path), displays `Notice("Không thể ghi vào file từ vựng: " + err.message)` and returns `{ success: false, isDuplicate: false, filePath, error }`.

### 2. `__mocks__/obsidian.ts`
- Enhanced `Vault` mock:
  - Added folder tracking via `Map<string, TFolder>` and `createFolder(path: string): Promise<TFolder>`.
  - Updated `getAbstractFileByPath` to look up both files and folders.
  - Updated `read`, `create`, `modify`, `delete` with path normalization.
- Enhanced `Notice` mock:
  - Added `Notice.instances` tracking to easily verify notices in test environments.

## Strict TDD Execution Evidence

1. **Red Phase (Failing tests)**:
   - Created `tests/services/VocabService.test.ts` (17 tests covering new file creation, nested folder creation, table insertion, heading preservation, duplicate context appending, callout formatting, daily note path resolution, 100% synchronous callback enforcement, and error resilience).
   - Executed `npx vitest run tests/services/VocabService.test.ts`:
     ```text
     FAIL tests/services/VocabService.test.ts
     Error: Failed to load url ../../src/services/storage/VocabService. Does the file exist?
     ```
2. **Green Phase (Implementation & Verification)**:
   - Implemented `src/services/storage/VocabService.ts`.
   - Executed `npx vitest run tests/services/VocabService.test.ts`:
     ```text
     ✓ tests/services/VocabService.test.ts (17 tests) 11ms
     Test Files  1 passed (1)
          Tests  17 passed (17)
     ```
3. **Full Project Verification**:
   - Executed `npx vitest run`:
     ```text
     ✓ tests/utils/textCleaner.test.ts     (26 tests)
     ✓ tests/utils/lruCache.test.ts        (11 tests)
     ✓ tests/utils/vocabFormatter.test.ts  (25 tests)
     ✓ tests/utils/textParser.test.ts      (23 tests)
     ✓ tests/scaffold.test.ts              (9 tests)
     ✓ tests/services/GoogleTranslate.test.ts (8 tests)
     ✓ tests/services/FreeDictService.test.ts (13 tests)
     ✓ tests/services/GeminiService.test.ts   (12 tests)
     ✓ tests/services/VocabService.test.ts    (17 tests)
     ✓ tests/services/ProviderManager.test.ts (16 tests)
     ✓ tests/services/BaseProvider.test.ts    (6 tests)

     Test Files  11 passed (11)
          Tests  166 passed (166)
     ```
4. **Build Pipeline Verification**:
   - Executed `npm run build`: esbuild bundled `main.js` cleanly with exit code 0.

## Status
DONE
