# RoomFit — PRD

## Original problem statement
Build RoomFit — AI-powered furniture planning & shopping assistant (built as Expo mobile app). Journey: Upload Floor Plan → Confirm Dimensions → Select Furniture Needs → Choose Style → Set Budget → Generate Layouts → Explore Products → Swap Furniture → Final Shopping List. Must be functional, honest about AI (no fake AI), deterministic constraint-based layouts, ~100-product demo catalog, swap with recalculation, CSV export, localStorage persistence, demo scenario (Mia, $2,500, 3.6 m wall, Japandi + warm).

## User choices
- Local on-device storage, no accounts
- Transparent deterministic fallbacks only (no AI connected)
- Pick images/files from device, preview locally

## Architecture (frontend only)
- `src/lib/types.ts` data model · `geometry.ts` room geometry & calibration · `catalog.ts` 99 demo products · `ranking.ts` metadata style ranking · `solver.ts` constraint layout solver/validator/swap · `ai.ts` future AI integration stubs
- `src/state/plan-store.tsx` app state (context) persisted to storage, invalidation rules
- Components: FloorPlan (SVG, tappable overlays), ProductSheet, ProductSwatch, WizardScaffold, BudgetBar, ui
- Screens: `/`, `/plan/{upload,dimensions,furniture,style,budget,layouts,shop,results}`

## Implemented (Jun 2026)
- Home with hero, benefits, how-it-works, Start Designing / Try a Demo
- Upload (JPG/PNG/PDF via document picker) or sample plan; honest "detection unavailable" notice
- Calibration by known wall, manual W/L, m/ft, validation, area, door/window editing
- Furniture needs (9 categories, qty, essential/optional, live summary)
- 4 style cards + moods + inspiration photo uploads
- Budget slider + input, allocations, estimates, remaining
- Solver: 6 strategies, 3 per set, regenerate cycles sets/product variants; checks bounds, overlap, door swing, 80 cm walkway (grid BFS), legroom, physical fit/windows, budget; invalid layouts explained with suggestions
- Shop: tap furniture → product details + ranked alternatives (fit/not-fit reasons), swap re-validates, totals sync
- Results: plan, budget summary, shopping list, CSV download (web) / share (native), print, edit actions, start over
- Tested: iteration 1 & 2 all pass

## Backlog
- P1: Real floor-plan recognition API (U-Net/CubiCasa5K) via `detectFloorPlan`
- P1: CLIP style matching service; LLM explanations of layouts
- P2: Drag-to-move furniture on plan; more room types (bedroom); real retailer links; shareable plan link
