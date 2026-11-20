import { ConversationProvider, useConversation, type MessagePayload } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, hasOwnerToken, setOwnerToken } from "./api.ts";
import type { FeedbackRecord, ProposalRecord, TranscriptMessage } from "../shared/types.ts";

type View = "conversation" | "improvement" | "deployments";
type UiMessage = {
  localId: string;
  providerId: string | null;
  role: "user" | "agent";
  text: string;
  timestamp: string;
};

const PUBLIC_AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID?.trim() || null;

export function App() {
  return <Workspace />;
}

function Workspace() {
  const [view, setView] = useState<View>("conversation");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [ownerAccess, setOwnerAccess] = useState(hasOwnerToken());

  const onMessage = useCallback((payload: MessagePayload) => {
    const record = payload as unknown as Record<string, unknown>;
    const text = typeof record.message === "string" ? record.message : "";
    const source = record.source === "ai" || record.role === "agent" ? "agent" : "user";
    if (!text) return;
    const providerId =
      typeof record.messageId === "string"
        ? record.messageId
        : typeof record.id === "string"
          ? record.id
          : null;
    setMessages((current) => [
      ...current,
      {
        localId: crypto.randomUUID(),
        providerId,
        role: source,
        text,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  return (
    <ConversationProvider
      onConnect={({ conversationId: id }) => setConversationId(id)}
      onMessage={onMessage}
      onError={(error) => setLastError(String(error))}
    >
      <div className="site-shell">
        <header className="utility-header">
          <div className="utility-brand">Conviction</div>
          <nav aria-label="Workspace views">
            <button className={view === "conversation" ? "active" : ""} onClick={() => setView("conversation")}>Think</button>
            <button className={view === "improvement" ? "active" : ""} onClick={() => setView("improvement")}>Improve</button>
            <button className={view === "deployments" ? "active" : ""} onClick={() => setView("deployments")}>History</button>
            <button
              className={ownerAccess ? "access-set" : ""}
              onClick={() => {
                const value = window.prompt("Owner token (stored only for this browser session)", "");
                if (value === null) return;
                setOwnerToken(value);
                setOwnerAccess(hasOwnerToken());
              }}
            >Access</button>
          </nav>
        </header>

        {lastError && (
          <div className="error-banner">
            <span>{lastError}</span>
            <button aria-label="Dismiss error" onClick={() => setLastError(null)}>×</button>
          </div>
        )}

        {view === "conversation" && (
          <ConversationView
            messages={messages}
            conversationId={conversationId}
            setConversationId={setConversationId}
            onError={setLastError}
          />
        )}
        {view === "improvement" && <ImprovementView />}
        {view === "deployments" && <DeploymentView />}
      </div>
    </ConversationProvider>
  );
}

function ConversationView({
  messages,
  conversationId,
  setConversationId,
  onError,
}: {
  messages: UiMessage[];
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  onError: (message: string) => void;
}) {
  const conversation = useConversation();
  const [starting, setStarting] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<UiMessage | null>(null);
  const [consented, setConsented] = useState(false);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => transcriptEnd.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const start = async () => {
    setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const session = await api.session().catch((cause: unknown) => {
        if (PUBLIC_AGENT_ID) return { agentId: PUBLIC_AGENT_ID, mode: "public" as const };
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Voice is not configured. Add your agent ID to .env.local. ${detail}`);
      });
      const options = "signedUrl" in session
        ? { signedUrl: session.signedUrl }
        : { agentId: session.agentId };
      await Promise.resolve(conversation.startSession(options) as unknown);
      window.setTimeout(() => {
        try {
          setConversationId(conversation.getId() || null);
        } catch {
          // onConnect supplies the canonical ID.
        }
      }, 500);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStarting(false);
    }
  };

  const connected = conversation.status === "connected";
  const stateLabel = starting
    ? "Opening the conversation…"
    : connected
      ? conversation.mode === "speaking"
        ? "Conviction is speaking."
        : "Listening. Take your time."
      : "Ready when you are.";

  return (
    <main className="experience-card">
      <header className="experience-header">
        <span>CONVICTION</span>
        <span>A SPACE TO THINK</span>
      </header>

      <section className="hero-stage">
        <p className="hero-kicker">A conversation, not a lesson.</p>
        <h1>What are you trying to understand?</h1>
        <Waveform active={connected || starting} speaking={conversation.mode === "speaking"} />
        <p className="session-state">{stateLabel}</p>
        {!connected && (
          <label className="session-consent">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
            />
            <span>I agree to send my voice and transcript to ElevenLabs for this conversation. With the default settings, feedback may store nearby transcript turns locally for up to 7 days.</span>
          </label>
        )}
        <div className="hero-controls">
          {!connected ? (
            <button className="begin-button" disabled={starting || !consented} onClick={() => void start()}>
              {starting ? "Connecting…" : "Begin conversation"}
            </button>
          ) : (
            <>
              <button className="soft-button" onClick={() => conversation.setMuted(!conversation.isMuted)}>
                {conversation.isMuted ? "Unmute" : "Mute"}
              </button>
              <button className="begin-button" onClick={() => conversation.endSession()}>End conversation</button>
            </>
          )}
        </div>
      </section>

      {messages.length > 0 && (
        <section className="transcript-drawer" aria-label="Conversation transcript">
          {messages.map((message) => (
            <article key={message.localId} className={`message ${message.role}`}>
              <div className="message-meta">
                <span>{message.role === "agent" ? "Conviction" : "You"}</span>
                <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
              </div>
              <p>{message.text}</p>
              {message.role === "agent" && (
                <button className="feedback-link" onClick={() => setFeedbackTarget(message)}>
                  Give feedback
                </button>
              )}
            </article>
          ))}
          <div ref={transcriptEnd} />
        </section>
      )}

      <footer className="experience-footer">
        <span>01 / EXPLORE AN IDEA</span>
        <span>{conversationId ? `SESSION ${conversationId.slice(-8).toUpperCase()}` : "THINK IN YOUR OWN WORDS"}</span>
      </footer>

      {feedbackTarget && (
        <FeedbackDialog
          target={feedbackTarget}
          allMessages={messages}
          conversationId={conversationId ?? safeConversationId(conversation)}
          active={connected}
          sendCorrection={(text) => conversation.sendUserMessage(text)}
          onClose={() => setFeedbackTarget(null)}
        />
      )}
    </main>
  );
}

function Waveform({ active, speaking }: { active: boolean; speaking: boolean }) {
  const heights = [18, 42, 56, 32, 20, 24, 20, 22, 18, 44, 64, 34, 26, 50, 60, 34, 23, 21, 20, 18, 22, 34, 60, 56, 30, 38, 66, 36, 20, 22, 20, 22, 18, 32, 66, 44, 20, 46, 58, 32];
  return (
    <div className={`waveform ${active ? "active" : ""} ${speaking ? "speaking" : ""}`} aria-hidden="true">
      <div className="wave-line" />
      {heights.map((height, index) => (
        <span key={index} style={{ "--bar-height": `${height}px`, "--bar-delay": `${index * 36}ms` } as React.CSSProperties} />
      ))}
    </div>
  );
}

function FeedbackDialog({
  target,
  allMessages,
  conversationId,
  active,
  sendCorrection,
  onClose,
}: {
  target: UiMessage;
  allMessages: UiMessage[];
  conversationId: string | null;
  active: boolean;
  sendCorrection: (text: string) => void;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [expected, setExpected] = useState("");
  const [recordOnly, setRecordOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidenceMessages = useMemo(() => {
    const index = allMessages.findIndex((message) => message.localId === target.localId);
    return allMessages
      .slice(Math.max(0, index - 2), Math.min(allMessages.length, index + 2))
      .map<TranscriptMessage>((message) => ({
        id: message.providerId,
        role: message.role,
        message: message.text,
        timestamp: message.timestamp,
      }));
  }, [allMessages, target.localId]);

  const submit = async () => {
    const effectiveConversationId = conversationId ?? `local-${crypto.randomUUID()}`;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        idempotencyKey: crypto.randomUUID(),
        conversationId: effectiveConversationId,
        responseId: target.providerId,
        responseTimestamp: target.timestamp,
        userFeedback: feedback,
        expectedBehavior: expected || null,
        includeExcerpt: true,
        evidenceMessages,
      };
      try {
        await api.createFeedback(payload);
      } catch {
        const existing = JSON.parse(localStorage.getItem("conviction-local-feedback") ?? "[]") as unknown[];
        localStorage.setItem(
          "conviction-local-feedback",
          JSON.stringify([{ ...payload, id: crypto.randomUUID(), status: "saved-locally", createdAt: new Date().toISOString() }, ...existing]),
        );
      }
      if (active && !recordOnly) {
        sendCorrection(`Feedback on your previous response: ${feedback}${expected ? ` Expected instead: ${expected}` : ""}`);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <p className="dialog-kicker">TARGETED FEEDBACK</p>
        <h2>What should change?</h2>
        <blockquote>{target.text}</blockquote>
        <label>What went wrong?<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} autoFocus /></label>
        <label>What should have happened? <span>(optional)</span><textarea value={expected} onChange={(event) => setExpected(event.target.value)} /></label>
        <label className="checkbox"><input type="checkbox" checked={recordOnly} onChange={(event) => setRecordOnly(event.target.checked)} />Record only—do not send this note into the live conversation</label>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="begin-button compact-button" disabled={saving || feedback.trim().length < 3} onClick={() => void submit()}>{saving ? "Saving…" : "Save and analyze"}</button></div>
      </section>
    </div>
  );
}

function ImprovementView() {
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [localFeedback, setLocalFeedback] = useState<Array<Record<string, unknown>>>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const stored = JSON.parse(localStorage.getItem("conviction-local-feedback") ?? "[]") as Array<Record<string, unknown>>;
    const cutoff = Date.now() - 7 * 86_400_000;
    const retained = stored.filter((item) => {
      const createdAt = Date.parse(String(item.createdAt));
      return Number.isFinite(createdAt) && createdAt > cutoff;
    });
    if (retained.length !== stored.length) {
      localStorage.setItem("conviction-local-feedback", JSON.stringify(retained));
    }
    setLocalFeedback(retained);
    try {
      const [feedbackResult, proposalResult, runResult] = await Promise.all([
        api.listFeedback(), api.listProposals(), api.listRuns(),
      ]);
      setFeedback(feedbackResult.feedback);
      setProposals(proposalResult.proposals);
      setRuns(runResult.runs);
    } catch {
      setFeedback([]); setProposals([]); setRuns([]);
    }
  }, []);

  const removeLocalFeedback = (id: string) => {
    const next = localFeedback.filter((item) => String(item.id) !== id);
    localStorage.setItem("conviction-local-feedback", JSON.stringify(next));
    setLocalFeedback(next);
  };

  const removeFeedback = async (id: string) => {
    setBusy(id);
    try { await api.deleteFeedback(id); await refresh(); }
    finally { setBusy(null); }
  };

  useEffect(() => { void refresh(); }, [refresh]);

  const decide = async (proposal: ProposalRecord, decision: "approve" | "reject") => {
    const confirmation = decision === "approve"
      ? window.prompt("Type PUBLISH to apply this prompt change to the live agent.") ?? undefined
      : undefined;
    if (decision === "approve" && confirmation !== "PUBLISH") return;
    const note = decision === "reject" ? window.prompt("Optional rejection note") ?? undefined : undefined;
    setBusy(proposal.id);
    try { await api.decideProposal(proposal.id, decision, confirmation, note); await refresh(); }
    finally { setBusy(null); }
  };

  const allFeedbackCount = feedback.length + localFeedback.length;
  return (
    <main className="secondary-card">
      <header className="secondary-header"><div><p>IMPROVEMENT LOOP</p><h1>Evidence before edits.</h1></div><button className="outline-button" onClick={() => void refresh()}>Refresh</button></header>
      <section className="metric-grid">
        <Metric label="Feedback events" value={allFeedbackCount} />
        <Metric label="Candidate changes" value={proposals.length} />
        <Metric label="Evaluation runs" value={runs.length} />
      </section>
      <section className="review-grid">
        <div className="stack">
          <h2>Candidate changes</h2>
          {!proposals.length && <Empty text="No evaluated proposals yet. No-key mode stores evidence locally for review." />}
          {proposals.map((proposal) => (
            <article className="review-item" key={proposal.id}>
              <div className="item-row"><Status value={proposal.status} /><time>{new Date(proposal.createdAt).toLocaleString()}</time></div>
              <h3>{proposal.report.summary}</h3><p>{proposal.rationale}</p>
              {proposal.patch && <pre>{JSON.stringify(proposal.patch, null, 2)}</pre>}
              {["ready-for-approval", "needs-owner-review"].includes(proposal.status) && <div className="item-actions"><button className="text-button" disabled={busy === proposal.id} onClick={() => void decide(proposal, "reject")}>Reject</button>{proposal.status === "ready-for-approval" && <button className="dark-button" disabled={busy === proposal.id} onClick={() => void decide(proposal, "approve")}>Review and publish</button>}</div>}
            </article>
          ))}
        </div>
        <div className="stack">
          <h2>Feedback record</h2>
          {!allFeedbackCount && <Empty text="No feedback recorded." />}
          {localFeedback.map((item) => <article className="review-item compact" key={String(item.id)}><div className="item-row"><Status value="saved-locally" /><button className="delete-link" onClick={() => removeLocalFeedback(String(item.id))}>Delete</button></div><p>{String(item.userFeedback)}</p><small>{new Date(String(item.createdAt)).toLocaleString()}</small></article>)}
          {feedback.map((item) => <article className="review-item compact" key={item.id}><div className="item-row"><Status value={item.status} /><span className="mono">{item.responseReferencePrecision}</span></div><p>{item.userFeedback}</p><div className="record-footer"><small>{new Date(item.createdAt).toLocaleString()}</small><button className="delete-link" disabled={busy === item.id} onClick={() => void removeFeedback(item.id)}>Delete</button></div></article>)}
        </div>
      </section>
    </main>
  );
}

function DeploymentView() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [offline, setOffline] = useState(false);
  const refresh = useCallback(async () => {
    try { setItems((await api.listDeployments()).deployments); setOffline(false); }
    catch { setItems([]); setOffline(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const rollback = async (id: string) => {
    if (window.prompt("Type ROLLBACK to restore the previous prompt.") !== "ROLLBACK") return;
    await api.rollback(id, "ROLLBACK"); await refresh();
  };
  return (
    <main className="secondary-card">
      <header className="secondary-header"><div><p>CONTROLLED RELEASES</p><h1>Every live change leaves a trail.</h1></div></header>
      {offline && <Empty text="Browser-only mode cannot publish through the API. Apply approved changes in the ElevenLabs dashboard." />}
      <div className="stack deployment-stack">
        {!offline && !items.length && <Empty text="No changes have been published from this workspace." />}
        {items.map((item) => {
          const id = String(item.id); const rolledBack = Boolean(item.rolled_back_at);
          return <article className="review-item" key={id}><div className="item-row"><Status value={String(item.action)} /><time>{new Date(String(item.created_at)).toLocaleString()}</time></div><p className="mono">{String(item.before_prompt_hash).slice(0, 12)} → {String(item.after_prompt_hash).slice(0, 12)}</p>{item.action === "publish" && !rolledBack && <button className="danger-button" onClick={() => void rollback(id)}>Rollback</button>}</article>;
        })}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <article className="metric"><strong>{value}</strong><span>{label}</span></article>; }
function Empty({ text }: { text: string }) { return <div className="empty-card">{text}</div>; }
function Status({ value }: { value: string }) { return <span className={`pill ${value}`}>{value.replaceAll("-", " ")}</span>; }
function safeConversationId(conversation: ReturnType<typeof useConversation>): string | null { try { return conversation.getId() || null; } catch { return null; } }
