# Debt Management Module

A role-based web app for tracking debtors and aging AR/arrears across branches.

## Getting started

```bash
npm install
npm run dev
```

Use the "Logged in as" dropdown in the sidebar to switch between personas and see how access changes.

## Personas

- **Branch Rep** — one per branch: `Branch Rep PSB`, `Branch Rep TIB`, `Branch Rep SIB`, `Branch Rep PCB`
- **CPM** — one per branch: `CPM PSB`, `CPM TIB`, `CPM SIB`, `CPM PCB`
- **Finance** — single persona with full access

## Tabs

| Tab | Access | Notes |
|---|---|---|
| Nature of Account/ Arrears | Finance only | Alphabetical reference list; activate/deactivate items; add new |
| Description | Finance only | Alphabetical reference list; activate/deactivate items; add new |
| List of Debtors | Branch Rep, CPM, Finance | Branch Rep/CPM see only their own branch's rows; Finance sees all; Branch Rep can add new debtor lines |
| List of AR / Arrears | Branch Rep, CPM, Finance | Debtor rows aggregated by SB/Dept + Nature + Description; scoped to branch for Branch Rep/CPM |
| List of AR / Arrears (FIN) | Finance only | Debtor rows aggregated across all branches by Nature + Description only; SB/Dept shown as `SC` |

All table columns are sortable (click a header to toggle ascending/descending, alphabetical or numeric depending on the column).

## Data

Reference lists and debtor records are seeded with sample data and persisted to `localStorage` in the browser, so changes made in the UI (new debtors, activating/deactivating reference items) survive a page reload.

## Brand colors

- Navy `#071D49` — primary
- Gold `#C9A24B` — accent
