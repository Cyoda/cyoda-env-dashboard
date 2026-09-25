# Feature & Backend Matrix

How the dashboard's panels map to backends across feature flags and the user's
entity-type toggle. Use this when adding a new panel, when wiring a new backend,
or when triaging a bug that smells like it depends on which mode you're in.

## Inputs

### Build-time feature flags (set in `apps/saas-app/.env*`)

| Flag | Default | Effect |
| --- | --- | --- |
| `VITE_FEATURE_FLAG_IS_CYODA_GO` | false | Build is targeting a cyoda-go backend (cloud digital twin without `/platform-*`). Implies `IS_CYODA_CLOUD=true` at runtime via `HelperFeatureFlags.isCyodaCloud()`. |
| `VITE_FEATURE_FLAG_IS_CYODA_CLOUD` | false | Build is targeting cyoda-cloud (or cyoda-go). Cloud-shaped endpoints (`/api/model/...`, `/api/entity/...`, `/model/{e}/{v}/workflow/...`) are reachable. |
| `VITE_FEATURE_FLAG_TRINO_SQL_SCHEMA` | false | Trino menu item + routes registered. |
| `VITE_FEATURE_FLAG_TASKS` | false | Tasks menu item + routes registered. |
| `VITE_FEATURE_FLAG_USE_MODELS_INFO` | false | Drives the global entity-type toggle (`BUSINESS` vs `PERSISTENCE`) and the Entity Viewer's models-info code path. |
| `VITE_FEATURE_FLAG_ENTITY_VIEWER_USE_JSON` | false | Entity Viewer renders entity data as raw JSON (cloud only). |
| `VITE_FEATURE_FLAG_CHATBOT` | false | ChatBot UI is enabled. |

All build-time flags are inlined by Vite at build time. To change one you re-run
`pnpm dev` (or rebuild for production). They are **not** flippable at runtime.

### Runtime UI state

| State | Values | Where set |
| --- | --- | --- |
| `entityType` | `'BUSINESS'` \| `'PERSISTENCE'` | Global UI toggle in the header (a.k.a. "Business" vs "Technical" entity view). Persisted in `useGlobalUiSettingsStore`. Available only when `USE_MODELS_INFO` is true. |

## Derived modes

The build-time flags collapse into three meaningful **modes**:

| Mode | `IS_CYODA_CLOUD` | `IS_CYODA_GO` | What's reachable on the wire |
| --- | --- | --- | --- |
| **Legacy** | false | false | `/platform-*` only |
| **Cloud** (regular cyoda cloud) | true | false | BOTH `/platform-*` AND cloud-shaped endpoints |
| **Go** (cyoda-go digital twin) | true (implicit) | true | Cloud-shaped endpoints only |

The `entityType` toggle then selects which backend a given panel uses **within
the available set**:

| Mode | `entityType=BUSINESS` | `entityType=PERSISTENCE` (Technical) |
| --- | --- | --- |
| Legacy | only legacy (cloud unavailable) | only legacy |
| Cloud | cloud (preferred) where the panel has a cloud variant | legacy fallback (uses `/platform-*`) |
| Go | cloud (only option) | **edge case** — see "Known gaps" |

## Panel matrix

Each cell answers: "Does this panel render? If yes, which backend does it use?"

Columns reflect the meaningful (mode, entityType) combinations. A `—` means the
panel is not visible in that combination. "Same as Cloud" or "Same as Legacy"
means identical behavior to the named column.

| Panel | Gating flag | Legacy | Cloud + Business | Cloud + Technical | Go + Business | Go + Technical |
| --- | --- | --- | --- | --- | --- | --- |
| Trino SQL Schemas | `TRINO_SQL_SCHEMA` | shown | shown | shown | shown | shown |
| Reporting (Reports / Stream / Catalog) | implicit | shown (legacy `/platform-*`) | shown (legacy) | shown (legacy) | — | — |
| Tasks | `TASKS` | shown (legacy) | shown (legacy) | shown (legacy) | — | — |
| Workflows list | implicit | legacy table | **cloud** (`/model/{e}/{v}/workflow/export`) | legacy table | cloud | edge case |
| Workflow editor (Create/Edit) | implicit | legacy granular pages (state/transition/criteria/process) | **cloud single-page editor** | legacy granular pages | cloud | edge case |
| Instances list | implicit | legacy (`/platform-api/statemachine/instances`) | **cloud** (`InstancesCloud.tsx`) | legacy | cloud | edge case |
| Instance detail | implicit | legacy | **cloud** (`InstanceDetailCloud.tsx`) | legacy | cloud | edge case |
| Entity Model Viewer | implicit | legacy | cloud (`/model/export/SIMPLE_VIEW/{e}/{v}` + `/entity/{id}`) | legacy | cloud | edge case |
| Processing Manager | implicit | shown (legacy `/platform-processing/*`) | shown (legacy) | shown (legacy) | — | — |
| ChatBot | `CHATBOT` | shown if flag | shown if flag | shown if flag | shown if flag | shown if flag |

Notes:

- "implicit" gating means the panel is always visible unless the mode itself
  hides it (Reporting / Tasks / Processing-Manager are hidden under Go because
  they require `/platform-*`).
- **Workflows list / editor / Instances list / Instance detail:** each page
  is a thin router that branches on
  `HelperFeatureFlags.isCloudBusinessActive(entityType)` and renders either
  the cloud variant (`*Cloud.tsx` / `cloud-*` subfolders) or the legacy
  component. The legacy code path runs in all other cases, including
  Cloud+Technical.
- **Entity Viewer:** the same `isCyodaCloud() && entityType === 'BUSINESS'`
  gating predates this matrix and lives inline at `PageEntityViewer.tsx:49`.
  Worth promoting to the helper layer in a future cleanup.

## Known gaps

### Go + Technical: every panel that depends on `entityType` is broken

Cyoda-go has no `/platform-*` endpoints, so the legacy fallback path used by
Cloud+Technical mode simply cannot run. The five affected panels (Workflows
list, Workflow editor, Instances list+detail, Entity Viewer) would attempt
legacy calls and fail.

**Recommended UX**: hide or disable the entity-type toggle in Go mode entirely —
the only meaningful option there is BUSINESS. Implementation tracked as a
follow-up; not part of sub-branch 3.

### Reporting / Tasks / Processing on Go

Hidden by design — these features have no cloud variant. If/when one is built,
revisit the gating helpers (`isReportingAvailable()`, `isTasksAvailable()`,
`isProcessingManagerAvailable()`).

## cyoda-go version compatibility

Go mode targets **cyoda-go v0.8.4**. Since that release, workflow import
rejects (`400 VALIDATION_FAILED` / `WORKFLOW_SCHEMA_VERSION_UNSUPPORTED`)
documents that earlier versions accepted silently. The cloud workflow editor
checks the same rules before saving, but only in Go mode
(`validateWorkflowDoc(doc, { cyodaGo: true })`):

- Workflow `version` must be `1.1`–`1.4`. New workflows are scaffolded at `1.4`
  in Go mode and `1.0` in Cloud mode.
- Criterion `jsonPath` must follow the JSON Path grammar (`$.amount`, not
  `amount`; subscripts only `[*]` or `[N]`).
- Operators must come from the catalog in
  `packages/statemachine-react/src/components/cloud-workflows/conditionCatalog.ts`.
- A `NOT` group takes exactly one child.

The model and version bounds live in `conditionCatalog.ts`. When a new
cyoda-go release bumps the workflow schema, update them to match
`GET /api/help/workflows/schema-version/versions`.

## How to add a new panel

When introducing a new panel:

1. Decide which modes it should be visible in. If it depends on `/platform-*`,
   it cannot be shown in Go.
2. Decide whether it has a cloud variant that should activate when both
   `IS_CYODA_CLOUD=true` AND `entityType === 'BUSINESS'`. If yes, factor a
   helper in `HelperFeatureFlags.ts` (e.g. `isCloudFooActive(entityType)`)
   and have the page branch on it. If no (legacy-only), no helper needed.
3. Update this matrix with a new row.
4. Update the menu (`apps/saas-app/src/components/LeftSideMenu.tsx`) and routes
   (`apps/saas-app/src/routes/index.tsx`) consistently.

## Helpers (where the matrix is enforced in code)

Located in `packages/http-api-react/src/utils/HelperFeatureFlags.ts`:

- `isCyodaGo()` — raw `IS_CYODA_GO` flag.
- `isCyodaCloud()` — `IS_CYODA_CLOUD` OR `isCyodaGo()`.
- `isCloudBusinessActive(entityType)` — `isCyodaCloud() && entityType === 'BUSINESS'`. (Gates the cloud vs. legacy branch in Workflows, Workflow Editor, Instances, and Instance Detail.)
- `isReportingAvailable()` — `!isCyodaGo()`.
- `isTasksAvailable()` — `!isCyodaGo() && isTasksEnabled()`.
- `isProcessingManagerAvailable()` — `!isCyodaGo()`.
- `isTrinoSqlSchemaEnabled()`, `isTasksEnabled()`, `isUseModelsInfo()`,
  `isEntityViewerUseJson()`, `isChatBotEnabled()` — raw flag reads.

When you add a new panel-mode helper, also add it to the list above.
