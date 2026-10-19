# Task 1 Brief: Core Types & Interfaces for Mini AI Tutor

## Objectives
Define core TypeScript interfaces and types for the Mini Conversational AI Tutor in `src/types/index.ts`.

## Requirements
1. In `src/types/index.ts`, define and export:
   ```typescript
   export interface TutorChatMessage {
     id: string;
     role: "user" | "model";
     content: string;
     timestamp: number;
   }

   export interface TutorSession {
     id: string;
     query: string;
     contextSentence: string;
     sourceLang?: string;
     targetLang?: string;
     docContext?: DocumentContextMeta;
     messages: TutorChatMessage[];
     createdAt: number;
     updatedAt: number;
   }

   export interface QuickPromptChip {
     id: string;
     icon: string;
     label: string;
     promptTemplate: (query: string, contextSentence: string) => string;
   }
   ```
2. Extend `PopoverCallbacks` in `src/types/index.ts` (or ensure `PopoverCallbacks` in `src/ui/FloatingPopover.ts` and `src/types/index.ts` has):
   ```typescript
   onPinToSidebarChat?: (session: TutorSession) => void;
   ```
3. Test Coverage:
   - Create `tests/types/tutorTypes.test.ts`.
   - Verify that objects matching `TutorChatMessage`, `TutorSession`, `QuickPromptChip` can be instantiated and type-checked properly.
   - Test helper function or factory (if any) or structural compliance.
4. TDD Workflow:
   - Write failing test in `tests/types/tutorTypes.test.ts`.
   - Run `npx vitest run tests/types/tutorTypes.test.ts` (see it fail).
   - Implement the types in `src/types/index.ts`.
   - Run `npx vitest run tests/types/tutorTypes.test.ts` (see it pass).
   - Run full test suite `npx vitest run` (ensure 0 regressions).
   - Commit with message: `feat(types): add tutor chat message and session types`.
