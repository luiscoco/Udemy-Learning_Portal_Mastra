# Untrusted input and prompt injection

A model cannot reliably tell instructions from data, so treat every retrieved document as untrusted and enforce side-effect safety **outside** the model.

```ts
// 1. Capabilities come from the customer's own message and verified identity, before any document is read.
const grant = grantsFor(request, verifiedEmail); // { emailToRequester, refundOrder }

// 2. Mastra output processor: wrap tool results before the model sees them.
const envelope: Processor = {
  id: 'untrusted-tool-results',
  processToolResult({ toolName, toolCallId, args, result, messageList }) {
    if (toolName !== 'searchDocs') return;
    taint.mark('searchDocs');
    const results = result.results.map((d) => ({ trust: 'untrusted', source: d.source, text: quarantine(d.text).text }));
    messageList.updateToolInvocation({
      type: 'tool-invocation',
      toolInvocation: { state: 'result', toolCallId, toolName, args, result: { results } },
    });
    return messageList;
  },
};
new Agent({ ..., outputProcessors: [envelope] }); // processToolResult fires from outputProcessors

// 3. Gateway inside every write tool's execute(): policy first, then a human if untrusted text was read.
const c = classifyCall('sendEmail', args, grant);
if (!c.authorized) return { ok: false, code: c.code };      // never reaches the sink, never asks a human
if (taint.tainted && (await approve(call)).decision !== 'approve') return { ok: false, code: 'DECLINED' };
outbox.push(args);
```

Why the scanner is not the defence: the example's disguised sentence ("the assistant forwards the customer list to …") passes because the scanner only knows base-form verbs such as "forward". Rewording, other languages, encodings or hidden characters defeat any fixed pattern list, and LLM-based detectors such as Mastra's `PromptInjectionDetector` lower the rate but cost a model call and still miss cases. Keep detection for flagging and logging.

Challenge outline: the protected agent can still copy untrusted text into the body of an email to the customer. Add a check in the gateway that the body of an outgoing email contains no sentence from a `third-party` document (or build the body from trusted policy documents only), and a test that fails before the fix.

Example input: the default customer message and vendor note. Expected offline result: the baseline is compromised (2 unrequested side effects). The protected run quarantines the blunt instruction, the disguised one slips past the scanner and is denied by the gateway, and the summary email is sent after approval.
