# AI Operating Instructions
You are being provided with codebase context via Repomix. I use a "Map & Scope" strategy to optimize your context window:

1. **The Map (repomix-map.txt):** This is a COMPRESSED version of the entire repo. It contains file structures and function signatures but lacks implementation details. Use this to understand the "where" and "how" of the global architecture.
2. **The Scope (repomix-scope.txt):** This contains FULL source code for the specific modules I am currently editing. Use this for actual logic, refactoring, and code generation.

**Your Goal:** - Use the **Map** to identify dependencies and cross-module impacts.
- Use the **Scope** to write and analyze code.
- If you need implementation details for a file found in the Map but missing from the Scope, ask me to "Expand the scope for [file path]."