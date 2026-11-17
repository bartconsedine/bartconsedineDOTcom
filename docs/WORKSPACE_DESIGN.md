# Workspace interaction and visual system

The private workspace at `/admin` uses a dark Tokyo Night-inspired palette, compact navigation and responsive app layouts designed for Omarchy's tiled windows. This is website styling; it does not modify desktop themes, window rules or system keybindings.

## Navigation

- The launchpad filters only apps returned by the authenticated registry. Search matches app names, descriptions, categories and access labels.
- **Ctrl+K** (or **Cmd+K**) opens the app launcher. Arrow keys select a result; Enter opens it; Escape closes it. Ordinary Tab navigation also works. The native modal contains focus and restores it on dismissal. Another open modal takes precedence. Omarchy's Super-key shortcuts remain available to the desktop.
- A full sidebar becomes a labeled-on-hover icon rail in medium windows and a horizontally scrollable navigation strip on mobile. The launcher remains available at every size. The rail retains accessible link names.
- Navigation preserves the registry's owner selector. Active links distinguish the same app shared by different owners. Nested personal chat keeps Robot Party selected.
- Route headers provide the app name, access context and owner-only access-management link. Each app owns its working controls rather than repeating the route description.

## App flows

| App | Primary improvements |
| --- | --- |
| Morning signal | Separate personal feed and news, compact settings, visible save state, reading/editor separation; TV stays on its dedicated layout. |
| Project board | Work counters and search, priority filtering, board/list task layouts, responsive lanes and clear status treatments. |
| Robot Party | Conversation feed/detail flow for narrow windows, recoverable drafts, filter reset, focus restoration when returning to the feed. Personal chat puts messages and composition before connection settings. |
| Japan command center | Search and filters for itinerary, bookings and checklist; progress, route metrics and timeline controls; newly created entries open and focus; active editors stay visible while editing a search match. Ctrl/Cmd+S saves dirty editable plans. |
| Calendar companion | Searchable agenda as the initial view, optional month grid, useful summary navigation, focused event forms, and outings within planning ideas. |
| People & access | Responsive invitation form, readable sharing explanation, separate action hierarchy, explicit revoke confirmation and clear saving/error states. |

## Implementation boundaries

`src/app/admin/workspace.css` scopes shell styling and the `--ws-*` tokens to `.admin-shell`. `src/lib/workspace-presentation.js` contains static labels, colors and presentation helpers, not app registration or permissions. `WorkspaceIcon` supplies small inline interface symbols without a new dependency.

Searches, open panels, selected views and launcher selection are disposable React state. No browser storage is introduced. Existing Supabase records, Google Calendar event ownership, revision checks, permissions and confirmed-save behavior remain authoritative. The redesign does not require migrations, new credentials, grants or hosted setup.

Motion is limited to brief hover transitions and disabled when reduced motion is requested. App container queries handle narrow content areas independently of viewport width. Fields, dialogs, loading, empty, error and view-only states remain part of the working interface.

## Verification

Behavioral UI tests render the actual components with isolated service and browser boundaries. They cover launcher controls, owner-specific navigation, search recovery, draft preservation, editor focus, saved-state behavior and existing access denials. These are fixture checks, not proof of live browser rendering or hosted persistence.

Release validation uses Node 22.23.2, `npm run db:validate`, `npm test`, `npm run build`, and the exact PR head's CI. Live QA should inspect the launchpad, launcher, five apps, personal chat and access manager at wide desktop, approximately 800px tiled width and 390px mobile width. Check keyboard focus, navigation, overflow, a recoverable save/reload flow, and viewer controls. Preserve user records when testing.

At implementation time the connected browser reported **“The browser access host is unavailable”**. Actual desktop/mobile screenshots and authenticated live interactions are blocked until browser access is restored. Passing fixture checks or a deployment build must not be reported as visual verification.
