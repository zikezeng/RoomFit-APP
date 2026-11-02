# RoomFit — project guide for Claude

RoomFit is a student team project: a mobile app (Expo / React Native) that helps people furnish an apartment.
The user uploads a floor plan, confirms the rooms, picks furniture, style and budget, and gets furniture
layouts and a shopping list. Floor plans are recognised with a CubiCasa5K model and can be viewed in 3D.

Several team members work on this repo, each with their own Claude. Read this file before changing anything.
Team members mostly write in Chinese; reply in the language the person uses, in plain, non-technical words.

## Repository layout

```
frontend/              The app (Expo SDK 58, expo-router, TypeScript). This is where most work happens.
floorplan3d-service/   Floor plan server: CubiCasa5K recognition + 3D model (.glb). Python / FastAPI.
backend/               OLD backend from Emergent (OpenCV room detection, Gemini). Not used when running
                       locally; kept only so the Emergent preview still works. Do not build new features here.
memory/PRD.md          Product history and decisions so far.
```

### App screens (frontend/app/) — one file per page

| Page | File |
|---|---|
| Home | `app/index.tsx` |
| 1. Upload floor plan | `app/plan/upload.tsx` |
| 1b. Floor plan in 3D | `app/plan/model3d.tsx` |
| 2. Confirm dimensions / edit rooms | `app/plan/dimensions.tsx` |
| 3. Choose room | `app/plan/rooms.tsx` |
| 4. Furniture needs | `app/plan/furniture.tsx` |
| 5. Style | `app/plan/style.tsx` |
| 6. Budget | `app/plan/budget.tsx` |
| 7. Layouts | `app/plan/layouts.tsx` |
| 8. Shop / swap products | `app/plan/shop.tsx` |
| 9. Results / shopping list | `app/plan/results.tsx` |

### Shared files (changing these affects every page — coordinate with the team first)

- `src/theme.ts` — colours, fonts, spacing, radius. Style with `makeStyles((colors) => ({...}))`; never write colour literals in components.
- `src/components/ui.tsx` — Button, Chip, Card, Notice, Stepper, Txt.
- `src/components/WizardScaffold.tsx` — header, step progress bar and bottom button used by every step.
- `app/_layout.tsx` — app shell, fonts, providers.

### App logic (not UI — leave alone unless the task is about it)

- `src/state/plan-store.tsx` — app state, saved on the device.
- `src/lib/solver.ts` — furniture layout solver (fit, walkways, door swing, budget).
- `src/lib/catalog.ts` — demo product catalog. `src/lib/apartment.ts` — room geometry and names.
- `src/lib/ai.ts` — calls `/api/floorplan/segment` during upload.
- `src/lib/floorplan3d.ts`, `src/components/Model3DView.tsx` — 3D page: calls `/api/floorplan/3d`, shows the .glb with `<model-viewer>` in a WebView (iframe on web).

Page files also contain small pieces of logic (saving choices, navigation). When redesigning a page, keep those.

## Floor plan server (floorplan3d-service/)

- `roomfit_3d.py` — CubiCasa5K inference (`Recognizer`), mask → rooms/walls/doors/windows (`extract_geometry`), 3D extrusion (`build_scene`).
- `app.py` — FastAPI: `GET /api/`, `POST /api/floorplan/segment`, `POST /api/floorplan/3d`.
- The CubiCasa5K model code (github.com/Aswi-ni/CubicasaRoomSegmentation) and weights (`cubicasa5k.pkl`, 209 MB) are downloaded at start-up, not stored in the repo.
- Ways to run it: `start_server_mac.command` (own Mac), `RoomFit_Server_Colab.ipynb` (Colab), `Dockerfile` (Hugging Face Spaces / Docker). See its README.

## Running the app locally

1. Start the floor plan server (on a Mac): `bash floorplan3d-service/start_server_mac.command`. It prints the address to use.
2. In `frontend/`, create `.env` (not committed — every person makes their own):
   `EXPO_PUBLIC_BACKEND_URL=http://<computer's IP>:8001`
3. `cd frontend && npm install && npx expo start --clear`, then scan the QR code with Expo Go (SDK 58).

Known pitfalls:
- `EXPO_PUBLIC_*` values are baked in at bundle time: after changing `.env`, restart with `--clear` and fully close/reopen Expo Go.
- The phone and computer must be on the same network. School Wi-Fi often blocks device-to-device traffic; the computer joining the phone's hotspot works. The computer's IP changes when the network changes.
- Expo Go must be signed out, or signed in to the same Expo account as `npx expo login` on the computer.
- `--tunnel` needs `@expo/ngrok` installed globally (`sudo npm install -g @expo/ngrok@^4.1.0`).
- After upgrading packages, delete `node_modules` and `package-lock.json` before `npm install`.

## How the team works

- Always start from the latest `main`. Work on a new branch named after the task (e.g. `budget-page-redesign`) and open a pull request. Never push directly to `main`.
- Each person owns certain pages. Only change the files the task needs; say which files you changed in the PR.
- Ask before changing shared files, `src/lib/*`, `src/state/*`, or anything in `floorplan3d-service/`.
- Keep `testID` props — they are used for testing.
- Before opening a PR, run in `frontend/`: `npx tsc --noEmit` (must pass). `npx expo lint` currently reports 5 issues that already existed (budget.tsx, layouts.tsx, ProductSheet.tsx, plan-store.tsx); do not add new ones.
- Never commit `.env`, `node_modules`, model weights (`*.pkl`), or personal floor plan images.
- The repo is still connected to Emergent. If someone keeps editing in Emergent, they must pull the latest `main` there first, and Emergent's AI must not touch the 3D files listed above.
