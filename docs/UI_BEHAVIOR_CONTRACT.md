# Frontend UI Behavior Contract

This document defines the shared interaction rules for the Brilina Forge workspace. It is the acceptance checklist for the sidebar, workspace context, transcript, composer, loading states, and responsive behavior. A CSS-only or component-only change is not complete until it respects these cross-component rules.

## Layout hierarchy

1. **Application shell:** occupies the available viewport; the document itself does not become a second scroll container.
2. **Navigation:** desktop sidebar is a collapsible rail; on narrow screens it becomes an off-canvas drawer over a backdrop.
3. **Workspace header:** repository, working branch, compare controls, and conversation context remain outside the transcript scroll area.
4. **Transcript:** owns vertical conversation scrolling. Long messages, run activity, diffs, and code patches must wrap or scroll internally without widening the whole app.
5. **Composer dock:** remains at the bottom of the workspace, respects mobile safe-area insets, grows with typed text up to a limit, and scrolls internally after that limit.

## Navigation and refresh rules

- Desktop sidebar expanded/collapsed preference persists locally across refreshes.
- The last selected conversation is restored when available. If the user explicitly starts a new chat, that empty-chat choice is also preserved across refresh.
- On mobile, the drawer starts closed after refresh regardless of the desktop collapse preference.
- Mobile drawer opens from the header menu button and closes from the drawer close button, backdrop tap, Escape, or selecting a conversation/new chat.
- When the viewport crosses into desktop layout, any open mobile drawer closes.
- The sidebar conversation list scrolls independently and must not push the workspace account/sign-out controls off-screen.
- Icon-only controls require accessible labels, keyboard focus indication, and a visible touch target.

## Session and data states

- Show a session-loading state while checking authentication; do not flash the signed-out screen or a fake working workspace.
- Show the GitHub sign-in screen only after the session check confirms the user is signed out.
- If the session endpoint fails, show a recoverable connection error and retry action.
- Show repository/branch loading and disabled states consistently. Sending stays disabled until the conversation has a selected repository and working branch.
- When a conversation is being restored, show a loading indicator. Late history responses must not overwrite a message the user has just sent in a newly created conversation.
- A conversation with messages should not show the empty-chat welcome hero above those messages.
- Errors should be shown once in the fixed composer area, not duplicated in both the transcript and composer.
- Repository and diff requests must not let stale responses overwrite the most recent selection.

## Chat interaction rules

- The composer grows as text is entered, up to its maximum height; beyond that it scrolls internally.
- Enter sends; Shift+Enter inserts a newline. The send action is disabled while empty, running, or missing repository context.
- If sending fails before a run starts, restore the user's draft instead of losing it.
- New chat and conversation switching clear the shared draft so text cannot accidentally be sent into a different conversation.
- Streaming follows the latest response while the user is already near the bottom. If the user scrolls up to read earlier content, preserve that reading position and offer a “Jump to latest” action.
- The transcript, run activity, diff panel, and composer must fit narrow phone widths without horizontal page overflow.
- Reduced-motion preferences, focus-visible states, semantic labels, and native keyboard behavior must remain supported.

## Owner verification matrix

Run these checks on the deployed app after CI passes. Test both a desktop-width browser and a phone-sized viewport (including the Android browser/installed web app if used).

### Refresh and session
- [ ] Refresh while signed in: no flash of the sign-in card; workspace appears after session resolution.
- [ ] Refresh while signed out: only the sign-in screen is shown after session resolution.
- [ ] Simulate an unavailable backend if practical: retry state is visible and actionable.

### Desktop navigation
- [ ] Expand and collapse the sidebar; the workspace remains usable and the preference survives refresh.
- [ ] With many conversations, scroll the conversation list; account/sign-out remains visible at the bottom.
- [ ] Select a conversation, refresh, and confirm it is restored.
- [ ] Click New chat, refresh before sending, and confirm the empty chat is retained.

### Mobile navigation
- [ ] Drawer is closed on initial load.
- [ ] Header menu opens the drawer with a backdrop; drawer close button, backdrop tap, and Escape each close it.
- [ ] Selecting a conversation or New chat closes the drawer.
- [ ] Rotate/resize from mobile to desktop while the drawer is open; the overlay closes and desktop layout is restored.
- [ ] All controls remain tappable and no content extends beyond the viewport.

### Chat and workspace hierarchy
- [ ] Repository and branch controls stay visible while the transcript scrolls.
- [ ] Compare opens/closes without covering the composer or trapping transcript scrolling.
- [ ] Existing conversations show their messages without the empty-chat welcome hero.
- [ ] Composer stays docked, expands with typing, and respects the mobile keyboard/safe area.
- [ ] Enter sends and Shift+Enter creates a newline; failed sends restore the draft.
- [ ] While a response streams, the view follows the bottom until the user scrolls upward; Jump to latest returns to the end.
- [ ] Run activity and diffs wrap long paths/patches without horizontal page scrolling.
- [ ] Loading, disabled, empty, success, and error states are understandable and are not duplicated.

## Status discipline

Automated CI can verify TypeScript/build and repository tests, but it cannot prove the live browser behavior above. Mark a check as passed only after it has been tested in the actual deployed UI. Keep owner-performed browser checks marked as owner-reported verification.
