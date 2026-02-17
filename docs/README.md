# D.O.C.S. Methodology

**D**esign Decisions • **O**perational Context • **C**ode Understanding • **S**upport Information

This directory is the project's long-term memory. It is designed to be **read by humans and AI** to understand the "Why" and "How" without analyzing every line of code.

## 📂 The 4 Pillars

### 0. Design Decisions
*   **Purpose:** The "Why". Explains architectural choices, trade-offs, and agreed-upon patterns.
*   **Style:** **Living Documents**. If a decision changes, update the existing file to reflect the *current* reality. You may keep a small "History" section at the bottom if the pivot was significant.
*   **When to write:** When making a non-obvious choice (e.g., "Why we use AppleScript for Terminal control").

### 1. Operational Context
*   **Purpose:** The "How-to-Run". Build steps, environment variables, dependencies, and deployment.
*   **Style:** Reference Manual. Keep it strictly factual and up-to-date.
*   **When to write:** When changing build scripts, adding dependencies, or changing target platforms.

### 2. Code Understanding
*   **Purpose:** The "How-it-Works". High-level maps, mental models, and explanations of complex subsystems.
*   **Style:** Educational. Use text, bullet points, or optional diagrams (Mermaid) to explain *flows* rather than just listing functions.
*   **When to write:** After implementing a complex feature (e.g., the Global Shortcut Loop) or refactoring.

### 3. Support Information
*   **Purpose:** The "Fix". Troubleshooting guides, known bugs, and debugging tricks.
*   **Style:** Q&A / Problem-Solution.
*   **When to write:** After solving a difficult bug or discovering a platform limitation.

---

## 📝 Naming Convention

New files should follow this format to keep them sorted and scannable:

`[Increment_Number]_[Topic_Slug].md`

**Examples:**
*   `001_apple_script_bridge.md`
*   `002_clipboard_persistence.md`
*   `003_keyboard_interceptor.md`

*Note: The `0_template.md` files are exceptions; they serve as starting points.*

---

## 🤖 Instructions for AI Assistants

1.  **Context First:** Before writing code, check **2_code_understanding** to grasp the existing mental models.
2.  **Update, Don't Deprecate:** When architecture changes, edit the relevant **0_design_decisions** file directly. Do not create "Superseded" files.
3.  **Maintenance:** If you fix a complex bug, ask: *"Should I add a Support note for this?"*
