Routing by task complexity (mocking depth, concurrency reasoning, novel API         
  surface):                                                                           
                                                                    
  
 | # | Task | Model | Thinking |  
 |---|---|---|---|
 | 1 | Extend @full-content-inventory/shared (types + column) | GLM 5.1 | low |  
 | 2 | Scaffold ai-summarizer package (deps, bin, stub types) | GLM 5.1 | low |
 | 3 | validateProviderModel (auth.ts + fixtures) | Qwen3.6 Plus | medium |  
 | 4 | Prompts module (14 labels + truncate/slice helpers) | MiniMax M2.7 | low |  
 | 5 | Pi SDK wrapper buildRunPrompt (streaming + mocked SDK) | Kimi 2.6 | high |  
 | 6 | summarize() orchestrator (Promise.all, per-row error, flush) | Kimi 2.6 | high |  
 | 7 | fci-summarize CLI (commander wiring) | MiniMax M2.7 | medium |  
 | 8 | Cross-package build + dry-run E2E with stubbed SDK | Qwen3.6 Plus | medium |  
                                                                                      
  Rationale in one line:                                            
  - GLM 5.1 / low for trivial mechanical edits (1, 2) — fast and cheap, low blast
  radius.                                                                             
  - MiniMax M2.7 / low–medium for self-contained text/CLI scaffolding (4, 7) — solid
  workhorse, no novel APIs.                                                           
  - Qwen3.6 Plus / medium when the work is deterministic logic with rich test cases   
  (3, 8) — strongest at structured TS + vitest patterns.                           
  - Kimi 2.6 / high for the two real-meat tasks (5, 6) — multi-file mocking,          
  streaming-event aggregation, concurrency invariants. These are the ones where a
  weaker model will silently break INV-03/INV-05 and leave you debugging.             
                                                                         
  If your budget forces consolidation: keep Kimi-high on Task 6 (everything else can  
  downshift one tier without much risk; Task 6 is the spec's load-bearing node).