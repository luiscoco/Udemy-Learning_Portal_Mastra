# HTTP run recovery

Memory remains the default. Standard Run tabs can reattach to a remembered live/finished memory run after reload while the API still retains it. To retain HTTP executions across process restarts, set these server-only options:

```dotenv
RUN_STORE=sqlite
# Configure RUN_STORE_SECRET (at least 32 random characters), or RUN_STORE_SECRET_FILE.
# Keep MLP_DATA_DIR on a persistent supported local filesystem.
```

Use a separate journal key so authentication-key rotation does not invalidate execution history. Back up that key and database consistently; an altered or missing key makes signed history unreadable. Do not paste keys into source, browser settings or chat.

The engine's optional synchronous `RunPersistence` boundary commits initial metadata before calling lab code and normal redacted events before publishing them. It stores only capability hashes, not raw values or input bodies. The original starter capability remains valid; recovery adds at most four more hashes. All public reads and mutations still require the owning session, with capability checks additionally required for cancel/approval.

On API restart, previously running executions become failed with a clear interruption error. Unresolved approval requests are no longer actionable; no human decision is invented and no former continuation is invoked. External actions may already have happened: verify them before starting another execution. This is recorded-state recovery, not automatic replay or exactly-once external effects. L32/L33's explicitly persisted workflow snapshots remain independent and can be resumed through their established lab controls.

Durable mode uses `runs/executions.db` and an exclusive SQLite runner-lock connection under the data root. Stop the old runner before starting another one with that journal. Process death releases the lock. This is a single active local runner, not a distributed execution service.

The journal has checked migrations and keyed metadata/event integrity. Limits are 100 retained runs globally, 20 per owner, 24-hour terminal retention, 8 MiB of regular event data per run plus a small terminal reserve, and at most 5,008 recorded events. Active work is never evicted to admit another run. Cleanup happens at startup, new starts and periodic sweeps. Storage/integrity failures fail closed; if failure reporting cannot be committed, the live client receives an explicit uncertain-storage failure and the journal refuses further access until repaired/restarted.

Standard Run tabs keep only an account/lab-scoped run ID in sessionStorage. Capabilities stay in memory, never URLs or browser storage. After reload, the authenticated owner obtains a new capability and replays events through the existing deduplicating reducer. **Recover latest run** can discover recent retained work even without a pointer. Reset clears the local pointer/view without deleting server history. Reconnection must happen within the existing disconnect grace period to keep a live execution; otherwise its cancellation outcome is restored.

## HTTP and SDK

`GET /api/runs?labId=lab-XX` returns `{ runs: RunSnapshot[] }` with at most ten owner snapshots. `POST /api/runs/:runId/recover` returns `{ snapshot, runToken }`. Both require a valid session and `X-Run-Subject: <encodeURIComponent(principal.sub)>`; the header binds the expected account but never selects a storage owner. Missing or mismatched accounts return 404; anonymous requests return 401. Responses use no-store and vary by Cookie. The typed SDK provides `api.runs.recent(labId, subject, signal)` and `api.runs.recover(runId, subject, signal)`.

Existing snapshot, event, cancel and approval routes remain compatible. The original starter capability remains valid; only the four newest additional recovery capabilities are retained. Co-deploy the additive SDK/UI for the new routes. Retention expiry returns 404. A restarted interrupted run returns failed events and rejects late decisions with 409, without retrying the lab. Run history does not restore form input bodies.

Chat/workspace presentations retain their existing thread-history controllers. Their HTTP records use the same server recovery APIs, but live bubble reattachment is not part of this milestone. Restoring a valid session across API restart requires configured durable sessions; memory-session users sign in again first. No provider calls are needed for recovery.

Historical terminal replay does not reapply learner progress: otherwise opening an old successful execution could undo a deliberate progress reset. A reattached live execution that subsequently succeeds still records its new completion normally.
