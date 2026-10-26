# Scoped review compiler contract — M5

This replaces the M4 all-history / empty-pending gate. Local only, not deployed. Keep private source/review artifacts out of the public repository. The owner does not edit this schema.

The encrypted trusted store accepts `packages[sourceSHA256] = {artifact, structuralIndex, mapping}` plus the separately reviewed canonical `appPolicy`. Preserve the original artifact/index, unknown headings and pending notes. Exact source hash, UTF-8 size, referenced byte-span hashes and character boundaries remain mandatory.

```js
mapping = {
  version: 2,
  artifactSHA256, // SHA256(UTF8(JSON.stringify(artifact)))
  scopedReview: {
    sourceSHA256,
    textClassification: {complete: true, unresolved: []},
    adoptionScope: {complete: true, unresolved: []},
    limitations: [{
      id,
      kind: 'source-uncertainty', // external-unavailable | image-unavailable
      impact: 'recorded-uncertainty', // outside-text-scope | required-context-gap
      summary, // reviewed source data, <=600 chars; not governing instructions
      evidence: [Span]
    }],
    pendingDispositions: [{
      index: 0, // zero-based item in original artifact.pending
      disposition: 'limitation', // or resolved-in-text-review
      limitationId // required only for limitation
    }]
  },
  manifest: { /* existing v1 fragment/replacement manifest, described below */ },
  decisions: [{id, disposition: 'applied', fragmentIds, replacementIds}]
};
```

Each original pending item must retain an explicit disposition. Missing images or external documents can be retained as `outside-text-scope` limitations. A source's own approximate/uncertain fact is `recorded-uncertainty`. Neither blocks solely because it is uncertain/unavailable. An actually missing required context element is `required-context-gap` and blocks. Unresolved text classification or adoption also blocks. The original `all_history_semantically_resolved`, unknown whole-turn-mode counts, and nonempty artifact.pending are informational, not activation gates. Do not erase those to make the result pass.

The v1 manifest fields remain: `version:1`, `format:'vector-continuation-six-fence-v1'`, `source:{version,sha256,lineNumbering:'1-based-inclusive'}`, `decisionRevision`, `branchId`, `review:{state:'complete',unresolved:[]}`, `fragments`, `replacements`, `currentStateId`, `required`, `nonContext`. Here `review.unresolved` concerns this text's unresolved adoption, not external limitations.

Fragments accept `{id, branchId, speaker, kind, partition, status, span, stateField?, communication?}`. Speaker is `user|assistant|state|metadata`; kind is `rp|reference|state`; partition is `inner|outer|backstage`; status is `adopted|unadopted|test`. IDs/stateField use ASCII letters/digits/underscore/hyphen, length 1–200. `stateField` is required for kind state.

`Span` is `{start_byte,end_byte_exclusive,sha256}` over exact UTF-8, zero-based. An existing `{start,end,sha256}` UTF-16 span or `{lines:[first,last],sha256}` (one-based inclusive) is also accepted for evidence. Fragments can alternatively retain `{range:{start,end},bodySHA256}`. Non-context entries use `{span,reason}` or `{range,sha256,reason}`, with reason `structural|outer|unadopted|test`. Hashes are mandatory for fragment/non-context partitions in v2. Source-worker section/fence IDs are unnecessary: this executor derives them from its own parser. A reviewed speaker can classify a span in an originally unknown section; the original heading/role is not rewritten.

The normalized fragments must fit a source section/fence, not overlap, and preserve exact bytes. Full text coverage is calculated from all fragments plus explicit non-context ranges. No complement-to-outer heuristic exists. Any unaccounted text returns `SCOPED_TEXT_COVERAGE_INCOMPLETE`.

Replacements retain `{id,scope,oldIds,effectiveId,preserveIds,evidence:[Span]}`. Scope is `assistant-rp` or `state-field` (same field). A historical field can use `speaker:state, kind:reference, stateField` on both old and effective fragments; it does not become another active state. Preserve original user input and unaffected facts; split local replacement units explicitly. Do not replace a whole memo merely because its successor is newer. There must be exactly one active current state anchor; additional retained state facts can be required references. Every artifact decision needs `applied|context-only` disposition and valid referenced fragment/replacement IDs.

The compiler derives `replacementTargets` from the original source positions, including transitive replacements and a shared replacement token used at multiple original positions. Retrieved provenance retains these targets, their exact hashes and parser origins, `supersedes`, and `preservedRecordIds`. The effective fragment still retains its actual source origin. These are source correction links, never native app event identities or additional historical sends.

The syntax parser indexes an explicit `## 追補継続メモ［M-…］` section separately in `supplements`; it does not increment conversation-turn counts or infer adoption. Reviewed references may use its parser-generated `supplement-M-…/section-0` origin. Its original date and archive provenance remain source data, not an RP clock or current-state selection.

Historical communication metadata is now preserved through compilation, indexing, required/retrieved chunks and both producer modes:

```js
communication: {
  channel: 'comms',        // here | project | backstage also supported
  medium: 'terminal-text',// scene-text | outside-consultation | backstage
  sender: 'reviewed-label-or-id', // or null
  recipient: null,
  occurredAt: {value:'12:40', precision:'approximate', clock:'rp'},
  receivedAt: null,
  readAt: null
}
```

All seven communication fields are required when the object is present. Unknown values are null. Non-null times use `{value,precision:'exact'|'approximate',clock:'rp'|'real'|'unspecified'}`; value is verbatim reviewed text, not an inferred ISO conversion. Labels max 200 chars; time value max 128. Channel/medium/partition must agree: comms/terminal-text/inner, here/scene-text/inner, project/outside-consultation/outer, backstage/backstage/backstage. No delivery or read receipt is inferred. Historical sender, origin, stateField and replacement disposition are also retained in retrieved provenance. Existing native app event identities and hashes are unchanged.

Limitations are a separate field in both manual/autonomous context and part of the context revision hash. They do not become fictional events or system instructions. They remain present even when their referenced external material is not fetched. Mandatory context plus limitations exceeding the existing bounded budget blocks rather than silently omits them. Plain adopted source-writer appends inherit explicitly supplied communication metadata; otherwise known channel/medium is retained with participants/times null.

A rejected scoped review keeps the previous accepted cache and reports `latestVerified:false`; generation does not silently fall back. No new live reads, imports, grants, deployment or context activation are authorized by this schema alone.

## Production private provisioning and append advancement

The existing owner reentry session plus same-origin CSRF protects two setup POST routes. Neither route accepts a bearer token/new secret or is exposed through the source-only service binding. The owner uploads an engineer-prepared private JSON file; they do not edit compiler JSON. Both routes require setup enabled, a current owner session, the exact enrolled scope and an explicit purpose consent. Installation does not activate generation or write Drive.

- `/shared-context/setup/install-review` accepts at most 16 MiB. Its envelope is `{version:1, operationId, expectedReviewRevision, scope, sourceRevisions, review:{package,appPolicy,sourcePolicy?}, consent:'install-reviewed-context-for-enrolled-sources'}`. `expectedReviewRevision` is null on first install. Scope binds owner, branch, policy revision, the canonical catalog SHA256, app document/log ID and app enrollment ID. All seven `{role,fileId,version,sha256}` source revisions must match actual reader results. App namespaces must exactly match authenticated app enrollment. Every baseline disposition must include the canonical event `eventId`, `bodyHash`, `recordHash`, and status. The existing ASCII-escaped event codec is authoritative.
- A portable **initial** envelope uses `version:2`, `expectedReviewRevision:null`, the same scope minus `ownerSub` and `appEnrollmentId`, and `version:null` in all seven source entries. It pins the exact source roles, file IDs, content hashes, catalog, branch, policy and app document/log. The existing owner session/enrollment supplies the two private identities; the production reader supplies a stable current Drive revision vector after exact byte/hash validation. The resulting encrypted review remains fully owner/enrollment scoped, and the installation receipt records all seven resolved versions/hashes. A portable envelope cannot overwrite an installed review or submit an individual append disposition. An explicitly consented selected-source policy in that initial envelope can authorize routine future updates as described below. Library version metadata is separate: a missing Library version remains null and is pinned by immutable Library file ID plus hash. Never substitute a Library version for a Drive revision.
- `/shared-context/setup/authorize-append` accepts at most 16 KiB. Its envelope replaces `review`/`sourceRevisions` with `commit`, and consent is `adopt-exact-drive-append`. The commit binds exact old/new source SHA256, new Drive version, source file ID, branch, turn, channel, decision revision and optional reviewed communication metadata. It authorizes a specific disposition; it does not write or mirror the source. A new operation with the current CAS revision can replace a pending disposition. Reusing an operation ID with different bytes is rejected.

The owner may install a selected-source update policy once, with consent `install-reviewed-context-and-trusted-source-updates`. The normal prepared installation uses this policy. Without it, the older exact `authorize-append` workflow remains available for compatibility. The policy is validated against the exact enrolled identities; extra fields, altered roles, foreign files or broader modes are rejected.

```js
sourcePolicy = {
  version: 1,
  continuation: {
    fileId: enrolledContinuationId,
    format: 'vector-continuation-six-fence-v1',
    adoption: 'owner-selected-structured-append-v1',
    memo: 'explicit-labeled-state-v1'
  },
  materials: [ // one entry for each of the five enrolled material roles
    {role, fileId, updates: 'same-file-same-role-v1'}
  ]
};
appPolicy.adoptNewEvents = true;
appPolicy.provenance = {
  version: 1, serverNamespace, deviceNamespaces // exact authenticated enrollment
};
```

**Ordinary continuation saves:** the reader validates a stable Drive revision vector, exact old source hash and unchanged historical prefix. One to 100 complete new L records can be saved together. Each has one original user and one original final/export assistant block in the established six-backtick format. Plain `内`/`内・対面` selects HERE; literal terminal traffic uses explicit `内・文字通信`. `外`/`外・相談` is retained outside actor memory. Recognized clock evidence, commentary and save-management wrappers remain non-context. Unknown headings, mixed modes, unframed prose and new correction directives return precise pending reasons with source/turn/offset where available. No language-model classifier decides adoption.

An ordinary final answer may include the observed separated `外｜継続メモ［M-…］` block. The explicit current-location field advances the active current-state field and links to its predecessor; other recognized factual fields are references. Existing correction targets remain linked to their original hashes. The parser's supported factual field labels are enumerated in `core/trusted-continuation.mjs`. Unknown fields remain pending. Mixed adoption/operation/count/source-administration fields are preserved as evidence outside actor memory; their embedded prose is not guessed into RP facts. Unknown times and participants remain null. Current-state updates require an explicit state field, not inference from a newer date or an app event. Multiple complete turns, multiple memos, repeated sync and later saves require no separate owner-uploaded disposition.

**Other materials:** instructions, personality, scene guidance, shared memory and prior-state refresh under the same enrolled file identity and role. These are role-preserving source replacements; file/role changes require enrollment review. The prior-state role remains historical/unadopted and cannot replace the active continuation state. Material refreshes do not create RP turns or change existing continuation correction chains.

**New app events:** exact baseline test exclusions bind event ID, bodyHash and recordHash together. New canonical records from the enrolled exporter namespaces are validated against their collection/channel/speaker provenance and existing partitions. Device HERE/COMMS become inner RP; BACKSTAGE/project remain stored outside actor memory. Server notification events must be COMMS/inner/Din with the server source-record format. Altered excluded-event hashes, unknown provenance or malformed events remain pending. Hashes prove canonical integrity; they are not cryptographic sender signatures. Trust rests on the exact owner-selected app document, authenticated export enrollment and source authorization. Directly modifying that document is not an alternative event-ingestion workflow.

The current exported user event is removed by exact identity from that request's resolved context and supplied once as current input. A different authentic event with identical text remains independent. Recently adopted inner events and the latest four Drive exchanges are mandatory context within existing capacity limits; older eligible material remains retrievable. A normal exchange exports through the existing durable app outbox, and the next manual/autonomous resolution reads it without owner adoption. Autonomous notification export uses the existing server journal and capability. No historical record is sent as a new message.

The original review package/index, correction semantics and limitations remain immutable. The encrypted review stores a derived current manifest, source-version/hash lineage, memo transitions, preserved administrative evidence and install receipts. Every derived source retains an explicit gap-free partition. Seven preserved historical pending groups can have reviewed dispositions or recorded limitations; they are not blanket generation blocks. New unresolved revisions are different: the entire combined candidate remains pending atomically. Independent app export can continue, but newly valid app/material additions do not bypass an ambiguous continuation revision. Previously accepted state is retained; generation does not silently use stale context. The owner/writer resolves only the reported exception. Routine saves require no manual action beyond updating the designated Drive copy.

Review and cache encryption use the existing AES key with separate owner/enrollment/policy AAD and chunked two-slot storage. All encryption is prepared before one SQLite transaction publishes the review and accepted cache pointers together. Interrupted/CAS-conflicting writes preserve the prior accepted pair. Pending candidates never publish derived reviews. Cache/review slots rotate; history, enrollments, source text, journals and outboxes are not deleted. Exact repeated installations/dispositions return their saved receipts without re-execution.

The operational boundary is the enrolled Drive copy. Owner/ChatGPT updates that copy; the once-installed policy advances eligible revisions automatically. Exceptional corrections or ambiguous revisions require review of the reported source issue. No Library-to-Drive mirroring, broader Google scope, credential creation, historical COMMS timeline reconstruction or model-generated adoption is introduced.

Native Google Doc text includes a final document sentinel LF. The existing shared-log reader removes exactly that LF before validating canonical records; catalog/app baseline hashes bind the resulting canonical text, while private snapshot evidence retains the original extraction hash. No source Doc is rewritten. The normal installation uses `adoptNewEvents:true` with validated provenance. The legacy frozen option `false` still exists but is not the agreed daily workflow. Exact known test exclusions never expand to future events.
