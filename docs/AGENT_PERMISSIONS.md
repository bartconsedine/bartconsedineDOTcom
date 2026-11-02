# Repository permissions and completion contract

This contract applies to agent work in `bartconsedine/bartconsedineDOTcom`. Read it with [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), and the [release workflow](../.agents/skills/pr/SKILL.md). It records how to use existing access; it does not grant new account, filesystem, or service permissions. Higher-priority runtime restrictions still apply.

## Scope every action

Use permissions only to complete the user's requested work for this repository. Before a service action, verify its account, repository/project, environment, resource, and requested effect. A logged-in browser, readable file, installed plugin, admin role, or exposed tool is a capability, not blanket authorization to inspect or change unrelated resources. Do not read private content merely to demonstrate access.

Routine repository reads, reversible fixes, checks, documentation, branches, and scoped PR delivery are covered by the task. Bart has authorized automatically merging and deploying completed, checked, scoped website changes through the normal workflow. Honor that authorization without asking for a second release confirmation. Preserve required checks, head guards, and branch protections.

Hosted database operations, credentials, memberships, sharing, access-policy changes, destructive actions, purchases, and sending messages require authorization appropriate to their specific effect. A general instruction to finish a task does not expand those grants. Reuse explicit authorization already present in the conversation; ask only for genuinely missing authority or information. Use reviewed app-data contracts for requested data maintenance.

## Session audit: 2 November 2026

This is a dated observation of the current session, not a permanent statement of configured access. Recheck runtime boundaries and service permissions when sessions or targets change. No global/plugin permission settings were modified during this audit.

| Surface | Observed capability or restriction | Repository use |
| --- | --- | --- |
| Files and shell | `workspace-write`; broad filesystem reads; writes to this checkout, the session visualization folder, and designated temporary folders. `.git` and agent/config directories have additional restrictions. | Read task-relevant files; keep durable project work in the repo. Request narrowly scoped escalation when required. Never print secrets or change global configuration to avoid a restriction. |
| Network and approvals | Shell network is restricted; escalation uses automatic review. Initial sandboxed Git fetch and GitHub access failed; narrowly scoped escalated fetch and PR listing succeeded. | Use approved access to the verified repo/services. A denial is not permission to bypass policy. Complete independent work and report unresolved denials with their stated reason. |
| GitHub | Repository/issue/PR/check tools plus authenticated CLI; an open unrelated PR was identified and preserved. | Branch and draft PR in this repo, exact-head checks, guarded authorized merge. Verify target before mutations. |
| Vercel | Project, deployment, environment, domain, and infrastructure tools are exposed. | Inspect the intended existing project and production commit; use the normal Git deployment. Credential, domain purchase, access, or infrastructure changes need their own task scope. |
| Supabase | Database, project, SQL, migration, and operational tools are exposed. | Follow app-data and migration runbooks, owner isolation, stale-write guards, and operation-specific authorization. Exposure does not prove hosted grants or authorize arbitrary SQL. |
| Google Drive and document control | Drive/Docs/Sheets/Slides and connected document-session tools are exposed. | Use only references required by the requested app/task. Check document and destination before edits; sharing remains separately scoped. |
| Gmail and Robot Party | Mail read/write/send and board read/post/reply tools are exposed. | Read only task-relevant evidence. Sending, forwarding, or posting requires explicit messaging authorization or an explicitly invoked skill that authorizes it. |
| Pages/Spaces, Sites, and Pets | Page/artifact editing, site publishing, and pet lifecycle tools are exposed. | Use only when requested or needed for the task; repository website changes follow this repo's workflow. Tool exposure alone does not verify installation or access. |
| Instacart, family safety, and helpline tools | Shopping/checkout, family settings, and helpline tools are exposed. | No use for routine repository work. Do not inspect personal settings, order goods, or modify account controls under repository authorization. |
| Browser/computer control and iMCP | UI automation and native automation entry points are exposed; their full reachable app/OS inventory was not exercised. | Prefer sufficient service tools; inspect only task-relevant tabs/apps. Foreground-screen capture through the Codex app is restricted to active voice chats. |
| Codex task/app controls | Thread, worktree, automation, usage, artifact, and app controls are exposed. | Never create/use worktrees here. New tasks, messages to other tasks, schedules, resets, and account/app changes follow their explicit authorization requirements. Do not spawn subagents unless user or applicable repository/skill instructions explicitly request delegation. |
| Web, image, file/artifact, clock, goals, and orchestration tools | Research, generation, local execution, resource access, and workflow helpers are exposed. | Use only where needed for the requested outcome; avoid unrelated reads, persistent schedules, or goals without the required user request. |

Plugin Management inspection confirmed **GitHub, Vercel, Supabase, Google Drive, Gmail, Sites, Robot Party, Instacart, Pets, Codex Document Control, and Plugin Management** each inherit **Use my default**, with the current default **Allow low-risk actions**. That setting may still deny sensitive actions; it is not an OAuth-scope or project-grant audit. Queries for **Pages**, **ChatGPT Pages**, and **Work Pets** returned **not installed** under those names, despite related exposed tools; **Pets** was confirmed separately. Pages installation/identity remains unresolved. No private mailbox, Drive file, family setting, or purchase was opened to test access. Provider OAuth scopes, OS privacy grants, and every remote ACL were not independently enumerated.

OpenAI's [permission guidance](https://developers.openai.com/blog/mastering-codex-remote-for-engineering) recommends narrowly scoped approvals. The effective boundary here remains the intersection of runtime enforcement, verified service access, user authorization, and repository scope. Repository prose cannot technically sandbox connected accounts or guarantee that later agents finish work.

## Finish the requested outcome

1. Establish the requested outcome, current branch/status, applicable instructions, service targets, and existing authorization. Work in the regular checkout on branches; preserve unrelated work and existing worktrees.
2. Complete the implementation, documentation, and meaningful checks required by the change. Use the pinned Node version and run `npm run db:validate`, `npm test`, and `npm run build` as required by the release workflow. Documentation-only changes also require link, command, instruction, and skill metadata review; do not add tests that merely assert prose wording.
3. Review the final diff, open/attach the scoped draft PR, verify checks for its exact final head, then merge using a head guard when authorized. Any new push requires fresh check evidence.
4. Verify the existing Vercel production deployment is Ready, its source equals the merge commit, and the live domain resolves to it. Record rollback target and include the direct live-site link.
5. Show visual confirmation whenever shipping something new. UI changes require actual live desktop/mobile screenshots and relevant interaction checks. Label local, preview, fixture, and unshipped evidence. For documentation-only changes, show the delivered document; do not imply the site's UI changed.
6. Continue independent authorized work when a check is blocked. Make a bounded diagnostic/retry where useful, fix actionable failures, and state any precise remaining blocker, unverified claim, and next required action. Do not substitute a plan, passing local tests, a draft PR, or a reachable URL for a completed release.

Representative boundaries: a website copy fix can proceed through checked release without another release question; a failing head check must be fixed and rerun before merge; a missing credential leaves the dependent live check unverified while unrelated checks continue; adding an admin tool does not authorize new memberships or an unrelated production schema change.

The final report must distinguish implemented, tested, merged, deployed, and live-verified work. Include the relevant evidence and unfinished items. Never claim a save, test, deployment, or verification succeeded without its confirming result.
