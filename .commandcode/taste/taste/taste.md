# Taste
- Wants issues fixed completely from the root cause, not patched superficially; explicitly asks agents not to overthink or complicate ("fix this issue from its roots completely. Don't overthink or complicate the issue."). Confidence: 0.8
- Communicates in short, direct, action-oriented messages ("do it", "continue", "go ahead", "start the implementation now") and expects immediate execution without lengthy ceremony. Confidence: 0.7
- Expects agents to consult and apply the user's installed skills when a task matches (e.g., design-taste-frontend, framer-motion-animator, "UIUX Max Pro") rather than improvising from scratch. Confidence: 0.6
- Prefers features to be optional/toggleable when they are not wanted in every workflow (e.g., a pick-UI-element mode that can be enabled/disabled; an option to run dev/build in an external cmd). Confidence: 0.6
- Wants the app version number bumped as part of each release of work ("update the version of the app"; "Make sure to update the application to a new version."). Confidence: 0.8
- Uses "fully functional and work completely" as the recurring acceptance bar for new features; non-working/broken functionality must be fixed so everything is functional and useful to the user. Confidence: 0.8
- For large multi-part redesigns, wants the assistant to work in orchestrator mode and dispatch sub-agents to explore and implement in parallel ("You are now on the orchestrator mode. So, orchestrates the sub-agent…"). Confidence: 0.6
- Ground-truths current state before continuing work — re-verifies actual wiring/code by reading live files and re-running checks, rather than trusting prior summaries or stale cached reads. Confidence: 0.8
