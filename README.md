# Vyapar ERP web app

The browser application: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and TanStack
Query 5. Setup, sign-in accounts and the full documentation are in the [root README](../README.md).

```bash
npm install
npm run dev          # http://localhost:3000, expects the API on http://localhost:5000
npm run lint         # ESLint with the Next.js and React rules
npx tsc --noEmit     # type check
npm run build        # production build; then npm start
```

**API address.** The app forwards `/api/*` to the API (see `next.config.ts`), so the browser talks to
one origin and the sign-in cookies stay first-party. Set `API_URL` when the API is elsewhere, for both
`npm run build` and `npm start`: `API_URL=http://127.0.0.1:5000 npm run build`.

## Layout

| Folder | Contents |
|--------|----------|
| `src/app` | Routes. `login`, `companies` and `profile` sit outside a company; everything else is under `(app)/c/[cid]/(shell)` and runs inside one company. `print/` holds the print and payslip pages. |
| `src/components/ui` | The UI kit: buttons, inputs, modal, confirm dialog, dropdown, combobox, date range, file and image upload, badges, cards, tabs, empty and error states. |
| `src/components/*` | Feature parts: `txn` (document list, form, payment modal, three-dot actions), `print` (templates and receipt formats), `reports`, `hr`, `email`, `settings`, `party`, `item`, `finance`, `users`, `audit`, `charts`, `layout` (sidebar and top bar). |
| `src/hooks` | Shared data pickers (`data.ts`) and small UI hooks (`use-reset-on`, `use-url-flag`, `use-query-state`, `use-debounce`, `use-media-query`, `use-qr-code`). |
| `src/lib` | API client (`api.ts`), money maths mirrored from the API (`money.ts`), document types (`txn.ts`), formatting (`utils.ts`), query helpers and types. |
| `src/providers` | Session, current company (settings and permissions) and the query client. |

Rules for changing the code (company-scoped query keys, permission checks, forms without effects,
phone layout) are in [docs/CONVENTIONS.md](../docs/CONVENTIONS.md).
