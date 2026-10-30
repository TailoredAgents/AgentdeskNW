> **Historical reference.** Preserved from an earlier request or checkpoint. Later owner decisions and [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) govern current scope, status and ordering. Claims, prices, test results and “next” instructions below belong to their original context and do not verify the current working tree or deployed version.

# Live provider acceptance — October 29, 2026

The user supplied an API key after the Phase 4 implementation checkpoint. It is configured in ignored `.env.local`; no credential is stored in source or this report. No application code changed during this follow-up.

| Check | Actual result |
|---|---|
| OpenAI authentication/model discovery | HTTP 200; configured text, Realtime and transcription models listed |
| Live Responses model | `gpt-6-astra` |
| Real tool dispatch | `daily_priorities` executed through the existing scoped and entitled service |
| Grounded answer | “Confirm Mike’s purchase timeline — overdue.” |
| Saved multi-turn context | Follow-up identified “Mike Bennett.” from the preceding exchange |
| Provider receipts | Three successful responses; 16,846 input tokens and 34 output tokens |
| Actual provider cost | Unknown; token receipts do not establish invoiced dollar cost |
| Realtime setup | Client-secret endpoint accepted `gpt-realtime-2.1` and configured session settings |
| Voice audio | Not tested; no microphone input or generated speech |
| Voice allowance | Unused session ended; reservation released; 60 minutes remain |
| External research | Disabled; no live search, investor findings or verified contacts |
| Business data | Four existing tasks retained; no task/CRM mutation, investor contact or external delivery |

Text requests used temporary process-only bounds: low reasoning, at most two model rounds and two tools for the initial read-only request, with at most 1,800 output tokens per response. The follow-up allowed one round and 1,000 output tokens. The saved normal application configuration remains unchanged apart from adding the key. The active database retains the live conversation and provider receipts so Settings can display evidence for the employee.

The successful voice setup was immediately closed before WebRTC connection. It verifies credential issuance and configuration acceptance, not actual speech, interruption, reconnect, live voice tool execution or mobile device behavior. Those require the intended browser/device walkthrough.

Restart AgentDesk to load the new local configuration. Copilot can now use live AI with fictional CRM records. To test voice, open Talk to Copilot and use the intended device microphone. External Hunter remains a separate opt-in requiring the existing entitlement, complete real subject-property criteria, an operator estimate and an approved bounded test budget. No external research was activated here.

The preceding code checkpoint passed 188 automated tests, 103 isolated HTTP checks, type checking, lint, production build and desktop/mobile interface walkthroughs. These follow-up live calls are additional evidence; the complete regression suite was not rerun for a configuration/documentation-only update.
