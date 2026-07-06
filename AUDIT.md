# Harly Platform - Feature Audit

_Última actualización: 2026-07-05_

## Summary
The platform has a solid foundation with auth, jobs, candidates, pipeline, portal, and settings. Key gaps are in polish, mobile UX, and some missing features.

---

## 1. PIPELINE (HIGH PRIORITY)

### What's Working
- Drag & drop between stages (desktop) ✅
- Stage column layout ✅
- Status filtering (active/hired/rejected/withdrawn) ✅
- Search candidates ✅
- Bulk actions (move, hire, reject) ✅
- Email toggle per stage ✅

### Issues
| Issue | File | Line |
|-------|------|------|
| **Mobile: no DnD** - Only shows a dropdown to switch stages, no drag support | `PipelineBoard.tsx` | 562-600 |
| **Fixed column width** - `w-56` / `lg:w-64` is rigid, no responsive expansion | `StageColumn.tsx` | 48 |
| **No horizontal scroll indicators** - Columns overflow but no visual cue | `PipelineBoard.tsx` | 612 |
| **No keyboard shortcuts** - Only basic keyboard sensor, no `←` `→` stage navigation | `PipelineBoard.tsx` | 210 |
| **No stage reordering** - Can't reorder stages from the board | - |
| **No candidate preview** - Click navigates away, no quick-view drawer | `CandidateCard.tsx` | 75 |

### Missing Features
- [ ] Column collapse/expand per stage
- [ ] Candidate count badges on mobile selector
- [ ] Stage color customization from board
- [ ] Pipeline analytics (time in stage, conversion rates)
- [ ] Candidate notes preview on hover
- [ ] Activity feed per stage

---

## 2. CARDS & UI COMPONENTS (HIGH PRIORITY)

### Dashboard Cards
| Issue | File | Line |
|-------|------|------|
| **No mobile stacking** - `lg:grid-cols-3` breaks on tablet | `dashboard/page.tsx` | 85 |
| **PipelineOverviewCard** - `grid-cols-5` for 5 stages is cramped on mobile | `PipelineOverviewCard.tsx` | 50 |
| **No loading skeletons** - Cards show nothing while loading | All widgets |

### Stat Tiles (Jobs Page)
| Issue | File | Line |
|-------|------|------|
| **2-col grid on mobile** - Stats too small on phones | `jobs/page.tsx` | 47 |
| **No animation on count changes** - Numbers just snap | `jobs/page.tsx` | 188 |

### General Card Issues
| Issue | Description |
|-------|-------------|
| **Inconsistent card styles** - `tileClass` vs `Card` component used differently |
| **No hover states** on dashboard widgets |
| **No empty state illustrations** - Just text + icon |

---

## 3. RESPONSIVE DESIGN (HIGH PRIORITY)

### Mobile Breakpoints
| Page | Issue |
|------|-------|
| **Dashboard** | `lg:grid-cols-3` - no `md:` breakpoint, jumps from 1→3 columns |
| **Jobs list** | `lg:grid-cols-4` stats, `sm:` for table - gap at 768px-1024px |
| **Candidates table** | `lg:grid-cols-[minmax(0,1fr)_18rem]` - sidebar hidden on mobile |
| **Pipeline** | Desktop-only DnD, mobile is just a dropdown |
| **Settings** | `lg:grid-cols-[248px_minmax(0,1fr)]` - good |
| **Portal login** | `lg:flex-row` - good split layout |

### Missing Mobile Patterns
- [ ] Bottom navigation bar for mobile
- [ ] Swipe gestures on cards
- [ ] Pull-to-refresh on lists
- [ ] Mobile-first action sheets (instead of dropdowns)
- [ ] Floating action buttons on mobile

---

## 4. CANDIDATES (MEDIUM PRIORITY)

### What's Working
- Full profile view with tabs ✅
- Edit drawer ✅
- Schedule interview ✅
- Email integration ✅
- AI score card ✅
- Import/export ✅
- Tags ✅
- Talent pool ✅

### Missing Features
| Feature | Priority | Notes |
|---------|----------|-------|
| **Candidate notes** | Medium | `NoteForm.tsx` exists but no inline display |
| **Activity timeline** | ✅ Done | Enriched timeline (applied, stage changes, notes, profile updated, file uploaded, hired/rejected) |
| **Bulk tag management** | Low | Can add tags but no bulk edit |
| **Candidate comparison** | Low | Side-by-side view of 2+ candidates |
| **Resume parsing** | ✅ Done | Structured AI résumé parsing + next-stage helper |
| **Avatar upload** | Low | `CandidateAvatarEdit.tsx` exists |
| **Source tracking** | Medium | Field exists but no UI to set it |

---

## 5. JOBS (MEDIUM PRIORITY)

### What's Working
- Job creation wizard ✅
- Question builder ✅
- Compensation section ✅
- Essentials/Advanced sections ✅

### Missing Features
| Feature | Priority |
|---------|----------|
| **Job templates** | Medium |
| **Duplicate job** | Low |
| **Job publish/unpublish toggle** | ✅ Done |
| **Job expiry dates** | Medium |
| **Internal notes on jobs** | Low |
| **Job sharing (LinkedIn, etc.)** | Medium |

---

## 6. PORTAL (MEDIUM PRIORITY)

### What's Working
- Magic link login ✅
- OAuth (Google, GitHub, LinkedIn) ✅
- Job listing ✅
- Application detail ✅
- Profile editing ✅
- Notifications ✅

### Missing Features
| Feature | Priority |
|---------|----------|
| **Application status tracking** | ✅ Done — portal shows application status |
| **Interview schedule view** | Medium |
| **Document upload (resume, cover letter)** | ✅ Done — CV upload in apply form + portal profile |
| **Application withdrawal** | Medium |
| **Saved jobs** | Low |
| **Refer a friend** | Low |

### UI Issues
| Issue | File |
|-------|------|
| **No mobile nav** - Just header links | Portal layout |
| **No loading states** | All portal pages |
| **No error boundaries** | Portal pages |

---

## 7. SETTINGS (LOW PRIORITY)

### What's Working
- Workspace settings ✅
- Members/roles ✅
- Security (2FA, passkeys, SSO) ✅
- AI settings ✅
- Email settings ✅
- Legal pages ✅
- Career page builder ✅
- Integrations (Slack, Cal.com, Google Calendar) ✅

### Missing Settings
| Setting | Priority |
|---------|----------|
| **Notification preferences** | Medium |
| **API key management** | ✅ Done — Developers settings page |
| **Webhook configuration** | ✅ Done — Developers settings page |
| **Custom fields** | High |
| **Email domain verification** | Low |
| **Audit log export** | Low |

---

## 8. AUTH & SECURITY (DONE)

### Completed
- Passkey login ✅
- OAuth (Google, GitHub, LinkedIn) ✅
- 2FA (TOTP) ✅
- SSO (SAML) ✅
- Magic link ✅
- Session management ✅
- Audit logs ✅

### Minor Issues
| Issue | File |
|-------|------|
| **No session revocation UI** | Security page |
| **No login history** | Security page |
| **No trusted devices** | Security page |

---

## 9. DASHBOARD (MEDIUM PRIORITY)

### Widgets
| Widget | Status |
|--------|--------|
| Inbox | ✅ Working |
| Today's interviews | ✅ Working |
| Pipeline overview | ✅ Working |
| Candidates needing review | ✅ Working |
| Jobs at risk | ✅ Working |
| Hiring performance | ✅ Working |

### Missing Widgets
- [ ] Team activity feed
- [ ] Upcoming deadlines
- [ ] Offer pipeline
- [x] Source effectiveness — implemented in Reports
- [x] Time-to-hire metrics — implemented in Reports

---

## 10. CAREER PAGE (DONE)

### What's Working
- Visual builder ✅
- Multiple templates (Minimal, Ashby, Playful) ✅
- Custom sections ✅
- Hero images ✅
- Department filters ✅

---

## 11. OFFERS (MEDIUM PRIORITY)

### What's Working
- Offer drawer ✅
- Salary/compensation fields ✅

### Missing
- [ ] Offer letter templates
- [ ] Offer approval workflow
- [ ] Offer signing (DocuSign integration)
- [ ] Offer comparison

---

## 12. TASKS (LOW PRIORITY)

### What's Working
- Task board ✅
- Task cards ✅
- Task list ✅

### Missing
- [ ] Task assignee management
- [ ] Due date reminders
- [ ] Task dependencies
- [ ] Recurring tasks

---

## 13. REPORTS (MEDIUM PRIORITY)

### What's Working
- Hiring performance charts ✅
- Source analytics ✅

### Missing
- [ ] Custom report builder
- [ ] Export to PDF/CSV
- [ ] Scheduled reports
- [ ] Team performance metrics
- [ ] Diversity analytics

---

## 14. EMAIL TEMPLATES (DONE)

### What's Working
- Template manager ✅
- Variable support ✅

---

## 15. COMPLIANCE (MINIMAL)

### Status
- Legal page management ✅
- GDPR consent fields ✅

### Missing
- [ ] Data retention policies
- [ ] Right to erasure workflow
- [ ] Consent audit trail

---

## Priority Matrix

### P0 - Critical (Fix Now)
1. Pipeline mobile UX (dropdown only, no DnD)
2. Dashboard responsive breakpoints
3. Card empty states

### P1 - High (Next Sprint)
1. ~~Candidate document upload (resume, cover letter)~~ ✅ Done
2. ~~Application status tracking in portal~~ ✅ Done
3. ~~Job publish/unpublish toggle~~ ✅ Done
4. Custom fields setting

### P2 - Medium (Backlog)
1. Pipeline analytics
2. Candidate notes timeline
3. Offer templates
4. Report export
5. Notification preferences

### P3 - Low (Future)
1. Candidate comparison
2. Job templates
3. Saved jobs in portal
4. Task dependencies
5. Audit log export

---

## Quick Wins (1-2 hours each)

1. **Add `md:` breakpoints** to dashboard grids
2. **Loading skeletons** for dashboard widgets
3. **Empty state illustrations** for all lists
4. **Mobile bottom nav** for portal
5. **Stage count badges** on mobile pipeline selector
6. **Candidate source dropdown** in edit drawer
7. **Job duplicate button**
8. **Session list** in security settings
