# AHSS / Special Savings / Loan Prototype — Testing Guide

This prototype seeds a fixed cast of members and applications so every status and
every flow can be exercised without having to build up state by hand first. If
you've clicked around and want this exact starting state back, click **Reset
demo data** in the top bar (it clears the browser's local storage overlay and
reloads `ahss-data.json` fresh).

## How to switch roles

Both apps have a role/user switch:
- **DCS mobile (Part A):** a segmented control under the top bar — **CDO / CO**
  (field: submits new applications) vs **BM / ABM** (approver: reviews and
  decides). Switching roles changes what the same dashboard tiles do.
- **ERP web (Part B):** always logged in as a single fixed user, **BAO - Nusrat
  Jahan**, since ERP-side approval for every module here (AHSS, Special
  Savings, Loan) is modeled as the BAO's job — there's no role switch to click.

## Status vocabulary (used everywhere)

`BM Pending` → `BM Sendback` / `BM Rejected` / (approved →) `ERP Pending` →
`ERP Sendback` / `ERP Rejected` / `ERP Approved`. Every list screen's status
filter dropdown uses exactly these seven values, matching the real DCS app.

## Where everything lives (DCS Home dashboard tiles)

| Tile | What it does |
|---|---|
| **AHSS** | Amar Hishab Shadharon Sonchoy: enrollment, approvals, auto debit/credit, account view |
| **Special Savings Application** | The DPS + Chaya Insurance wizard, BM approval |
| **Admission** | New Member Admission (real) — triggers the "open AHSS?" prompt on save |
| **Loan** | New Loan Application (real) — AHSS as disbursement/collection mode |
| Dashboard, VO List, Survey/PO List, Profile Update, Insurance Application | Stubs (toast only) — not built out, out of scope for both BRDs |

On the ERP side, the **Member** and **Loan** top-menu items are now real
(Member List/New Member, Loan Approval Buffer). **Savings** still branches into
**Special Savings** (Buffer built; the other 7 sub-items are stubs) and
**Amar Hishab Savings** (Account Opening / Consent Buffer Panel / Account View —
all real). Programme Admin, VO, Insurance and Report are stubs.

## Members seeded (15)

| Member No. | Name | Project / Branch | Persona — what to test with them |
|---|---|---|---|
| MEM-100234 | Rahima Begum | DABI / Mirpur-2 | Has an **approved AHSS account** (AHSS-000123, balance ৳13,450) with an **active loan** (LOAN-5001, disbursed via AHSS, installment auto-debiting) — see a fully working AHSS+Loan lifecycle in its transaction history. Also has a pending AHSS auto-debit **discontinue** request (CR-3001, BM Pending). |
| MEM-100511 | Salma Khatun | Progoti / Savar | Has an **approved AHSS account** (AHSS-000156) *and* an **ERP-Approved Special Savings account** (SSA-6001, linked to that AHSS account) — the one to use for testing the Special-Savings-autocredit/autodebit-to-AHSS toggles (AHSS module → Auto Debit/Credit). |
| MEM-100788 | Nasima Akter | DABI / Mirpur-2 | AHSS request **BM Pending** (REQ-2001). Loan **BM Rejected** (LOAN-5005). No AHSS account yet — good for testing the "no account found" popup in the Loan form. |
| MEM-101020 | Rina Islam | BCUP / Cumilla Sadar | AHSS request **ERP Pending** (REQ-2002). Special Savings application **BM Pending** (SS-4001). |
| MEM-101250 | Ayesha Siddika | DABI / Mirpur-2 | AHSS account **approved** (AHSS-000201, from REQ-2003, ERP Approved). Special Savings application **ERP Pending** (SS-4002). Also has a **BM Rejected** AHSS auto-debit continuation (CR-3003). |
| MEM-101477 | Moriom Jahan | Progoti / Savar | **Clean slate** — no AHSS account, no applications of any kind. Use this one for "start everything from scratch" testing (new AHSS enrollment, new Special Savings, new loan). |
| MEM-101600 | Halima Khatun | DABI / Mirpur-2 | AHSS request **BM Rejected** (REQ-2004). |
| MEM-101733 | Kulsum Begum | DABI / Mirpur-2 | AHSS request **BM Sendback** (REQ-2005). |
| MEM-101855 | Fahima Akter | Progoti / Savar | AHSS request **ERP Rejected** (REQ-2006). Loan **ERP Rejected** (LOAN-5006). |
| MEM-101966 | Nurjahan Ali | BCUP / Cumilla Sadar | AHSS request **ERP Sendback** (REQ-2007). |
| MEM-102077 | Delwar Hossain | DABI / Mirpur-2 | Has an approved AHSS account (AHSS-000305, balance ৳3,000). Loan **BM Pending** (LOAN-5002) — use this one to walk a loan through BM → ERP approval yourself. |
| MEM-102188 | Shirin Aktar | Progoti / Savar | Has an approved AHSS account (AHSS-000318). Loan **ERP Pending** (LOAN-5003) — use this one to test the ERP Loan Approval Buffer directly. |
| MEM-102299 | Abdul Karim | DABI / Mirpur-2 | Has an **approved AHSS account** (AHSS-000322, balance ৳24,600) with an **active loan** (LOAN-5004, disbursed via AHSS). Also has an AHSS auto-debit continuation request sitting at **ERP Sendback** (CR-3004). |
| MEM-102410 | Nasrin Sultana | BCUP / Cumilla Sadar | Special Savings application **BM Rejected** (SS-4004). No AHSS account — good for testing the Special Savings + "no AHSS account" combination. |
| MEM-102521 | Monira Yasmin | NCDP / Bogura Sadar | Special Savings application **ERP Sendback** (SS-4005), and it's the one example where the client **declined** Chaya insurance (`insuranceInterested: false`). |

## Applications by status, at a glance

**AHSS enrollment (`ahssRequests`):** REQ-2001 BM Pending · REQ-2002 ERP Pending
· REQ-2003 ERP Approved · REQ-2004 BM Rejected · REQ-2005 BM Sendback ·
REQ-2006 ERP Rejected · REQ-2007 ERP Sendback — all seven statuses covered.

**AHSS auto debit/credit (`continuationRequests`):** CR-3001 BM Pending (AHSS,
Rahima) · CR-3002 ERP Approved (Special Savings→AHSS link, Salma) · CR-3003 BM
Rejected (AHSS, Ayesha) · CR-3004 ERP Sendback (AHSS, Abdul Karim).

**Special Savings applications:** SS-4001 BM Pending · SS-4002 ERP Pending ·
SS-4003 ERP Approved (has a linked account, SSA-6001, Double Chaya policy) ·
SS-4004 BM Rejected · SS-4005 ERP Sendback (no-insurance example).

**Loan applications:** LOAN-5001 ERP Approved/active (Rahima) · LOAN-5002 BM
Pending (Delwar) · LOAN-5003 ERP Pending (Shirin) · LOAN-5004 ERP
Approved/active (Abdul Karim) · LOAN-5005 BM Rejected (Nasima) · LOAN-5006 ERP
Rejected (Fahima).

## Known simplifications (by design, not bugs)

- Deposit maturity amounts and Chaya insurance premiums use a simple,
  clearly-artificial formula, not BRAC's real DPS/insurance rate chart (that
  chart wasn't legibly readable from the scanned guideline, and I didn't want
  to present fabricated real-looking numbers as authoritative).
- Dashboard, VO List, Survey/PO List, Profile Update and Insurance
  Application tiles are stubs (toast only) — out of scope for the BRDs this
  prototype is built from.
- Member admission and the new-member/loan forms don't themselves have a
  BM/ERP approval stage (neither BRD specifies one for admission) — only the
  AHSS, Special Savings and Loan *products* go through BM → ERP approval.
