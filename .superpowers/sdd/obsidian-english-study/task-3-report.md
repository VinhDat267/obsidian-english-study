# Task 3 Report: Pure Logic — LRU Memory Cache & Vocabulary Formatter

## Summary
Successfully implemented the pure TypeScript LRU Cache and Markdown Vocabulary Formatter utilities for `obsidian-english-study` under strict Test-Driven Development (TDD).

## Implemented Modules

### 1. `src/utils/lruCache.ts`
- **Class**: `LRUCache<T>`
- **Specifications & Signatures**:
  ```typescript
  export class LRUCache<T> {
    constructor(capacity?: number); // Default capacity = 200
    get(key: string): T | undefined; // Retrieves value and moves key to most recently used
    set(key: string, value: T): void; // Inserts/updates; evicts least recently used on overflow
    has(key: string): boolean;
    clear(): void;
    get size(): number;
    keys(): string[]; // Ordered newest -> oldest (most recently used first)
    values(): T[];    // Ordered newest -> oldest (most recently used first)
  }
  ```
- **Key Capabilities**:
  - RAM-based O(1) operations leveraging native JavaScript `Map` insertion order.
  - Automatic eviction of the oldest entry when size exceeds capacity.
  - Updates recency position on both `get()` and existing key `set()`.
  - In-order navigation for session history and instant $0\text{ms}$ query resolution.

### 2. `src/utils/vocabFormatter.ts`
- **Functions**:
  - `getDefaultTemplate(): string`: Provides initial markdown table structure for `Vocabulary.md` (`## Sổ từ vựng tiếng Anh` + header & separator lines).
  - `escapePipes(text: string): string`: Safely escapes `|` into `\|` (protecting unescaped delimiters) and converts newline characters into spaces for markdown table safety.
  - `highlightWordInContext(sentence: string, word: string): string`: Automatically identifies and wraps the target word in `**word**` within context sentences while preventing redundant double-bolding (`****word****`) and respecting word boundaries.
  - `formatTableRow(result: LookupResult, highlightWord?: boolean): string`: Formats `LookupResult` into a 5-column table row (`| **query** | *pos* \`/phonetic/\` | vietnameseTranslation | contextSentence | YYYY-MM-DD |`).
  - `formatCallout(result: LookupResult): string`: Formats `LookupResult` into an Obsidian callout flashcard block (`> [!vocab] ...`).
  - `insertRowAtTableEnd(markdown: string, row: string): string`: Pinpoints the exact boundary of the active vocabulary table and appends `row` at the end of the table while strictly preserving subsequent subheadings (`## Notes...`), blank lines, and trailing content. Automatically initializes with `getDefaultTemplate()` if no table exists.
  - `isWordInContent(markdown: string, query: string): boolean`: Case-insensitive verification checking whether `query` exists as a table entry (`| **query**`) or callout title (`> [!vocab] query`).
  - `appendContextToExisting(markdown: string, result: LookupResult): string`: When duplicate words are queried with new contexts, appends the new sentence into the existing row's Context column separated by `<br>• ` without duplicating rows or re-writing unchanged data.

## Strict TDD Execution Evidence

1. **Red Phase (Failing tests)**:
   - Created `tests/utils/lruCache.test.ts` (11 unit tests).
   - Created `tests/utils/vocabFormatter.test.ts` (25 unit tests).
   - Executed `npx vitest run tests/utils/lruCache.test.ts tests/utils/vocabFormatter.test.ts`:
     ```text
     FAIL tests/utils/lruCache.test.ts (Cannot find module)
     FAIL tests/utils/vocabFormatter.test.ts (Cannot find module)
     Test Files  2 failed (2)
     ```
2. **Green Phase (Implementation & Verification)**:
   - Implemented `src/utils/lruCache.ts` and `src/utils/vocabFormatter.ts`.
   - Executed `npx vitest run tests/utils/`:
     ```text
     ✓ tests/utils/vocabFormatter.test.ts (25 tests) 9ms
     ✓ tests/utils/lruCache.test.ts (11 tests) 5ms
     ✓ tests/utils/textCleaner.test.ts (26 tests) 5ms
     ✓ tests/utils/textParser.test.ts (23 tests) 11ms
     Test Files  4 passed (4)
          Tests  85 passed (85)
     ```
3. **Full Project Verification**:
   - Executed `npx vitest run`:
     ```text
     ✓ tests/utils/lruCache.test.ts (11 tests) 7ms
     ✓ tests/utils/textCleaner.test.ts (26 tests) 10ms
     ✓ tests/utils/vocabFormatter.test.ts (25 tests) 16ms
     ✓ tests/utils/textParser.test.ts (23 tests) 14ms
     ✓ tests/scaffold.test.ts (9 tests) 12ms
     Test Files  5 passed (5)
          Tests  94 passed (94)
     ```
4. **TypeScript Compiler Verification**:
   - Executed `npx tsc --noEmit`: 0 errors.
5. **Build Pipeline Verification**:
   - Executed `npm run build`: esbuild bundled `main.js` cleanly with 0 errors.
6. **Pure TypeScript Compliance**:
   - Confirmed 0 imports from `'obsidian'` across `src/utils/lruCache.ts` and `src/utils/vocabFormatter.ts`.

## Git Commit
- **Commit Hash**: `d879011114a0c67b0e602cf199fe769f390f6953` (`d879011`)
- **Message**: `feat: implement LRU cache and markdown table/callout vocab formatter`

## Status
DONE
