# OpenAI provider references and integration decisions

Reviewed against official OpenAI documentation on October 29, 2026. This records documented API compatibility and engineering decisions. It does **not** establish that this workspace's API account can access a model or that live inference, speech, or external research has succeeded. Provider verification belongs in `PROGRESS.md` and the Phase 4 completion report.

## Model and request parameters

The documented model ID is `gpt-6-astra`. Its model page lists reasoning efforts `low`, `medium`, `high`, `xhigh`, and `max`. `ultra` is not a documented API effort and must not be sent as one. The user's development-session description, “GPT-6 Astra Ultra,” is separate from AgentDesk's server-side API configuration. The application uses `high` as a latency/quality starting point; `max` remains configurable for deliberate testing. Account access and practical latency still need live verification. [GPT-6 Astra model reference](https://developers.openai.com/api/docs/models/gpt-6-astra)

Use `/v1/responses` for the manager's function calls. Astra's Chat Completions support does not include tool calling. Send `reasoning.effort`; do not send `temperature`, `top_p`, or `top_logprobs` with this reasoning configuration. Do not use an undocumented “Ultra” model alias or silently substitute a cheaper model when access fails. Configuration failure should be explicit. [Current model migration and parameter guidance](https://developers.openai.com/api/docs/guides/latest-model)

The model's advertised context/output limits are ceilings, not appropriate per-employee spending budgets. AgentDesk must bound context, response output, tool rounds, tool counts and requests independently, then enforce the employee's remaining allowance before a request.

## Manager loop and Agents SDK decision

OpenAI supports both direct Responses integrations and the Agents SDK. Responses leaves history, tool execution, continuation and runtime policy with the application. The SDK adds a runner, reusable agents, handoffs and related orchestration features while retaining application responsibility for storage and approvals. [Runtime comparison](https://developers.openai.com/api/docs/guides/agents#compare-agent-runtime-options)

AgentDesk keeps its existing bounded manager loop over direct Responses REST. Its specialists primarily invoke deterministic, scoped business services; separate autonomous model loops would not improve those operations. This minimizes migration risk to Phase 3 entitlements and approvals. The decision does not prevent a later SDK adoption when reusable multi-agent orchestration would justify it. SDK guardrails, model prompts and handoffs would still not replace the service authorization boundary. [Official libraries and Agents SDK guidance](https://developers.openai.com/api/docs/libraries#use-the-agents-sdk)

## Function calls and final answers

Function definitions use explicit strict mode. Every object schema closes additional properties; every declared field is required, with nullable values representing optional choices. Model arguments are parsed and validated again by the server. The server chooses the actor from authenticated application identity and invokes the same services as the UI. A model cannot supply a tenant, role, entitlement or approval. Return each result with the original `call_id`. Preserve all returned output items when continuing the loop, including reasoning items alongside function calls. [Function calling guide](https://developers.openai.com/api/docs/guides/function-calling)

Validate provider response envelopes before interpreting them. Handle provider failure, refusal, incomplete output, tool calls and final messages as distinct states. An assistant commentary item is not proof of completion. A successful HTTP status alone is not proof that the assistant produced a final answer or performed a business action.

The output cap includes reasoning. A response can exhaust that cap before emitting visible text and still incur usage. Check `status`, `incomplete_details`, message phase and content; preserve completed application artifacts if a later round fails. Omit `reasoning.context` unless the selected model's support has been verified; retaining opaque reasoning items does not require guessing a model-specific context setting. [Reasoning and output budgets](https://developers.openai.com/api/docs/guides/reasoning)

## Conversation continuity and access changes

The selected strategy is local, tenant-scoped state with `store: false`. Current documentation states that encrypted reasoning items are returned by default for stateless reasoning requests. Explicitly requesting `reasoning.encrypted_content` is compatible, but the essential requirement is preserving the complete replayable output sequence. Store provider history separately from display messages, including original assistant `phase` values and matching tool outputs. Plain assistant text alone loses that state. [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)

Provider history is sensitive derived business data. It must not be exposed directly to the browser or replayed after its authorization assumptions become stale. AgentDesk must scope it to the authenticated employee and conversation, invalidate it when relevant record access changes, and reconstruct context from current authorized services. Opaque reasoning cannot be reliably redacted by searching for a name. Display history and linked artifacts retain their existing scope checks.

On manual replay, preserve commentary/final-answer phase values. An early update preceding a tool call must not become the saved final answer on a later turn. [Assistant phase guidance](https://developers.openai.com/api/docs/guides/reasoning#phase-parameter)

## Receipts, retries and usage

Provider accounting and subscription billing are separate records. Store model, provider response ID, request identifier when available, status and authoritative usage details without logging transcript bodies or credentials. Input/output totals include different token classes; cached and reasoning details should remain identifiable. A missing usage object is **unknown usage**, never evidence of zero usage. Actual provider expense remains unknown unless a supported receipt or explicit pricing calculation establishes it; simulated subscription billing must stay labeled simulated.

Application retry safety is implemented locally. Scope request IDs to organization, employee and conversation; reject conflicting payload reuse. Scope tool receipts to their parent execution and call ID, record the argument fingerprint, and replay the original completed result instead of creating a second task, proposal or research job. Do not assume a provider response ID or an arbitrary request header guarantees deduplication of inference charges.

A network timeout can leave the provider outcome unknown. Preserve that distinction and avoid silently retrying a consequential application action. Failure handling releases unused allowance according to the disclosed local policy while retaining an indeterminate provider receipt for reconciliation. A process crash after dispatch must not convert a pending tool receipt into permission to execute the operation again. Automatic recovery needs an atomic result or a service-level idempotency key.

## Verification requirements

Automated provider tests use mocked responses and no billable API requests. They should cover schema enforcement, reasoning/tool continuation, follow-up state, explicit refusal/incomplete outcomes, repeated and conflicting call IDs, unknown/malformed usage, scope revocation, entitlement denial, process interruption and preservation of completed artifacts.

Live text requires an API key configured only on the server, account/model access and explicit local testing. Live speech additionally requires microphone permission, a usable browser, an audio-output device and a successful Realtime session. Research needs its own selected source/provider path and evidence inspection. Passing the mocked tests establishes neither provider access nor production readiness. New Western remains a prospective customer; no endorsement, production CRM connectivity or verified investor contact is implied.

## Communications tool schemas — October 30, 2026

Phase 3 extends the existing Responses function registry with bounded inbox search/read/prepare/propose tools. Schemas remain strict, reject extra fields and make optional values explicitly nullable. Tool approval is never delegated to the model. Current official reference checked: [Function calling — strict mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode). No model selection or provider configuration changed; verification uses mocked model responses and deterministic local workflows.
