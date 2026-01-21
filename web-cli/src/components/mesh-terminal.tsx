"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, Message, ServerEvent } from "@/lib/protocol";

type LogTone = "info" | "success" | "warn" | "error";

type LogLine = {
  id: string;
  text: string;
  tone: LogTone;
  timestamp: number;
};

type SessionsIndex = Record<string, Conversation>;

const createUid = () => crypto.randomUUID();

const shortId = (value: string) => value.slice(0, 8).toUpperCase();

const formatTime = (value: number) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);

const COMMANDS = [
  { command: "help", description: "Show manual and available commands." },
  {
    command: "name <alias>",
    description: "Update your display name for new messages.",
  },
  {
    command: "connect <uid>",
    description: "Initiate a secure channel with another operator.",
  },
  {
    command: "sessions",
    description: "List active sessions and recent activity.",
  },
  {
    command: "switch <uid|index>",
    description: "Focus on a session (use uid fragment or index from sessions).",
  },
  {
    command: "clear",
    description: "Clear system log output (messages remain).",
  },
  {
    command: "uid",
    description: "Display your current identifier.",
  },
];

const KEYBINDS = [
  { keys: "Ctrl + K", action: "Focus prompt" },
  { keys: "Ctrl + L", action: "Clear log" },
  { keys: "Shift + ?", action: "Toggle manual" },
  { keys: "Esc", action: "Dismiss overlays" },
];

export function MeshTerminal() {
  const [uid] = useState(() => createUid());
  const [alias, setAlias] = useState(() => `Operator-${shortId(uid)}`);
  const [sessions, setSessions] = useState<SessionsIndex>({});
  const [activeConversation, setActiveConversation] = useState<string | null>(
    null,
  );
  const [log, setLog] = useState<LogLine[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const manualRef = useRef<HTMLDivElement>(null);
  const initialAlias = useRef(alias);

  const appendLog = useCallback((text: string, tone: LogTone = "info") => {
    setLog((prev) => {
      const next = [
        ...prev,
        { id: crypto.randomUUID(), text, tone, timestamp: Date.now() },
      ];
      if (next.length > 200) {
        return next.slice(next.length - 200);
      }
      return next;
    });
  }, []);

  const sortedSessions = useMemo(() => {
    return Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions]);

  const activeSession = activeConversation
    ? sessions[activeConversation] ?? null
    : sortedSessions[0] ?? null;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [log, activeSession]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, name: initialAlias.current }),
      signal: controller.signal,
    }).catch(() => {
      appendLog("Failed to register with relay.", "error");
    });
    return () => controller.abort();
  }, [uid, appendLog]);

  const upsertSessions = useCallback((conversation: Conversation) => {
    setSessions((prev) => {
      const existing = prev[conversation.id];
      const next: SessionsIndex = { ...prev, [conversation.id]: conversation };
      if (!existing) {
        appendLog(
          `Session ${shortId(conversation.id)} online with ${Object.values(conversation.participants)
            .filter((participant) => participant.uid !== uid)
            .map((participant) => participant.name)
            .join(", ")}`,
          "success",
        );
      }
      return next;
    });
  }, [appendLog, uid]);

  const upsertMessage = useCallback(
    (conversationId: string, message: Message) => {
      setSessions((prev) => {
        const current = prev[conversationId];
        if (!current) return prev;
        if (current.messages.some((entry) => entry.id === message.id)) {
          return prev;
        }
        const next: SessionsIndex = {
          ...prev,
          [conversationId]: {
            ...current,
            messages: [...current.messages, message],
            updatedAt: message.timestamp,
          },
        };
        const author = current.participants[message.from ?? ""]?.name ?? "System";
        if (message.kind === "message" && message.from !== uid) {
          appendLog(
            `${author} ➜ ${shortId(conversationId)}: ${message.text}`,
            "info",
          );
        }
        return next;
      });
    },
    [appendLog, uid],
  );

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "hello":
          appendLog(`Linked to relay as ${shortId(event.uid)}.`, "info");
          break;
        case "conversation":
          upsertSessions(event.payload);
          break;
        case "message":
          upsertMessage(event.payload.conversationId, event.payload.message);
          break;
        case "user":
          appendLog(
            `${event.payload.name} (${shortId(event.payload.uid)}) is online.`,
            "info",
          );
          break;
        case "system":
          appendLog(event.payload.text, "warn");
          break;
        default:
          break;
      }
    },
    [appendLog, upsertMessage, upsertSessions],
  );

  useEffect(() => {
    const source = new EventSource(`/api/events?uid=${uid}`);
    source.onmessage = (event) => {
      try {
        const payload: ServerEvent = JSON.parse(event.data);
        handleEvent(payload);
      } catch (error) {
        console.error("Failed to parse event", error);
      }
    };
    source.onerror = () => {
      appendLog("Connection interrupted. Attempting to repair…", "warn");
      source.close();
      setTimeout(() => {
        setConnectionEpoch((value) => value + 1);
      }, 2500);
    };
    return () => source.close();
  }, [appendLog, handleEvent, uid, connectionEpoch]);

  const focusPrompt = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusPrompt();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLog([]);
      }
      if (event.shiftKey && event.key === "?") {
        event.preventDefault();
        setManualOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setManualOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusPrompt]);

  const sendRename = useCallback(
    async (nextName: string) => {
      const name = nextName.trim();
      if (!name) {
        appendLog("Name cannot be empty.", "error");
        return;
      }
      const response = await fetch("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, name }),
      });
      if (!response.ok) {
        appendLog("Failed to update name.", "error");
      } else {
        setAlias(name);
        appendLog(`Callsign updated to ${name}.`, "success");
      }
    },
    [appendLog, uid],
  );

  const sendConnect = useCallback(
    async (target: string) => {
      const peer = target.trim();
      if (!peer) {
        appendLog("Provide a UID to connect.", "warn");
        return;
      }
      if (peer === uid) {
        appendLog("Loopback disabled. Specify another UID.", "warn");
        return;
      }
      appendLog(`Negotiating session with ${shortId(peer)}…`, "info");
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUid: uid, toUid: peer }),
      });
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({
          error: "Unable to connect.",
        }));
        appendLog(error ?? "Connection failed.", "error");
        return;
      }
      const { conversation } = (await response.json()) as {
        conversation: Conversation;
      };
      setActiveConversation(conversation.id);
      upsertSessions(conversation);
      appendLog(
        `Session ${shortId(conversation.id)} synchronized.`,
        "success",
      );
    },
    [appendLog, uid, upsertSessions],
  );

  const sendMessage = useCallback(
    async (payload: string) => {
      const trimmed = payload.trim();
      if (trimmed.length === 0) return;
      const target = activeSession?.id;
      if (!target) {
        appendLog("No active session. Use connect or switch first.", "warn");
        return;
      }
      const response = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: target, fromUid: uid, text: trimmed }),
      });
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({
          error: "Delivery failed.",
        }));
        appendLog(error ?? "Delivery failed.", "error");
      }
    },
    [activeSession, appendLog, uid],
  );

  const runCommand = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const [command, ...rest] = trimmed.split(/\s+/);
      const payload = rest.join(" ");
      switch (command.toLowerCase()) {
        case "help":
        case "manual":
          appendLog("Manual loaded.", "info");
          setManualOpen(true);
          break;
        case "name":
          await sendRename(payload);
          break;
        case "connect":
          await sendConnect(payload);
          break;
        case "sessions": {
          if (sortedSessions.length === 0) {
            appendLog("No sessions tracked.", "info");
            break;
          }
          sortedSessions.forEach((session, index) => {
            const peers = Object.values(session.participants)
              .filter((participant) => participant.uid !== uid)
              .map((participant) => `${participant.name} (${shortId(participant.uid)})`)
              .join(", ");
            appendLog(
              `[#${index + 1}] ${shortId(session.id)} with ${peers} · ${formatTime(session.updatedAt)}`,
              "info",
            );
          });
          break;
        }
        case "switch": {
          if (sortedSessions.length === 0) {
            appendLog("No sessions to switch.", "warn");
            break;
          }
          const target =
            payload ||
            (() => {
              appendLog("Provide a session reference.", "warn");
              return "";
            })();
          if (!target) break;
          let slot: Conversation | undefined;
          const numeric = Number.parseInt(target, 10);
          if (!Number.isNaN(numeric)) {
            slot = sortedSessions[numeric - 1];
          }
          slot =
            slot ??
            sortedSessions.find((session) =>
              session.id.toLowerCase().includes(target.toLowerCase()),
            );
          if (!slot) {
            appendLog("Session not located.", "warn");
            break;
          }
          setActiveConversation(slot.id);
          appendLog(
            `Focused session ${shortId(slot.id)}.`,
            "success",
          );
          break;
        }
        case "clear":
          setLog([]);
          appendLog("Log cleared.", "info");
          break;
        case "uid":
          appendLog(`Your UID is ${uid}. Share carefully.`, "info");
          break;
        default:
          await sendMessage(trimmed);
          break;
      }
    },
    [
      appendLog,
      sendRename,
      sendConnect,
      sortedSessions,
      uid,
      sendMessage,
    ],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = prompt;
      setPrompt("");
      if (!value.trim()) return;
      appendLog(`> ${value}`, "info");
      await runCommand(value);
    },
    [appendLog, prompt, runCommand],
  );

  const activeMessages = activeSession?.messages ?? [];
  const peers = activeSession
    ? Object.values(activeSession.participants).filter(
        (participant) => participant.uid !== uid,
      )
    : [];

  useEffect(() => {
    if (!manualOpen) return;
    const handler = (event: MouseEvent) => {
      if (!manualRef.current?.contains(event.target as Node)) {
        setManualOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [manualOpen]);

  return (
    <div className="mx-auto flex h-[90vh] w-full max-w-5xl flex-col rounded-3xl border border-slate-800/60 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8 text-slate-100 shadow-2xl ring-1 ring-slate-800/40">
      <header className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/60 bg-black/30 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Identifier
          </p>
          <p className="mt-1 font-mono text-lg text-sky-300">{uid}</p>
        </div>
        <div className="rounded-2xl border border-slate-700/60 bg-black/30 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Callsign
          </p>
          <p className="mt-1 font-mono text-lg text-emerald-300">{alias}</p>
        </div>
        <div className="rounded-2xl border border-slate-700/60 bg-black/30 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Active session
          </p>
          {activeSession ? (
            <div className="mt-1 space-y-1">
              <p className="font-mono text-base text-amber-200">
                {shortId(activeSession.id)}
              </p>
              <p className="text-sm text-slate-300">
                {peers.map((peer) => peer.name).join(", ") || "Awaiting peer"}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              Use <span className="font-mono text-slate-300">connect &lt;uid&gt;</span>
            </p>
          )}
        </div>
      </header>

      <section className="mt-6 flex flex-1 gap-6">
        <aside className="hidden w-64 flex-col rounded-2xl border border-slate-700/60 bg-black/20 p-4 md:flex">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Sessions
          </p>
          <div className="mt-3 space-y-2">
            {sortedSessions.length === 0 && (
              <p className="text-sm text-slate-500">
                No live sessions. Connect to a peer.
              </p>
            )}
            {sortedSessions.map((session, index) => (
              <button
                key={session.id}
                onClick={() => setActiveConversation(session.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  activeSession?.id === session.id
                    ? "border-sky-400/70 bg-sky-500/10"
                    : "border-transparent bg-white/5 hover:border-slate-500/60"
                }`}
              >
                <p className="flex items-center justify-between font-mono text-xs text-slate-400">
                  <span>#{index + 1}</span>
                  <span>{shortId(session.id)}</span>
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  {Object.values(session.participants)
                    .filter((participant) => participant.uid !== uid)
                    .map((participant) => participant.name)
                    .join(", ") || "Solo"}
                </p>
                <p className="text-xs text-slate-500">
                  {formatTime(session.updatedAt)}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-auto rounded-xl border border-slate-700/60 bg-black/30 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Keybinds
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {KEYBINDS.map((binding) => (
                <li key={binding.keys} className="flex justify-between gap-2">
                  <span>{binding.action}</span>
                  <span className="font-mono text-slate-400">
                    {binding.keys}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="flex flex-1 flex-col rounded-3xl border border-slate-700/60 bg-black/20">
          <div
            ref={scrollRef}
            className="flex-1 space-y-2 overflow-y-auto rounded-t-3xl bg-black/40 p-6 font-mono text-sm tracking-wide"
          >
            {log.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <span className="text-xs text-slate-500">
                  {formatTime(entry.timestamp)}
                </span>
                <span
                  className={
                    entry.tone === "error"
                      ? "text-rose-400"
                      : entry.tone === "success"
                        ? "text-emerald-300"
                        : entry.tone === "warn"
                          ? "text-amber-300"
                          : "text-slate-200"
                  }
                >
                  {entry.text}
                </span>
              </div>
            ))}
            <div className="mt-4 space-y-2 rounded-2xl border border-slate-700/50 bg-black/50 p-4">
              {activeMessages.length === 0 ? (
                <p className="text-slate-500">
                  Session feed waiting. Send a message to start the exchange.
                </p>
              ) : (
                activeMessages.map((message) => {
                  const authorName =
                    message.from && activeSession
                      ? activeSession.participants[message.from]?.name ??
                        "Unknown"
                      : "System";
                  return (
                    <div
                      key={message.id}
                      className="flex items-start gap-3 text-slate-200"
                    >
                      <span className="text-xs text-slate-500">
                        {formatTime(message.timestamp)}
                      </span>
                      <span
                        className={
                          message.kind === "system"
                            ? "text-amber-300"
                            : message.from === uid
                              ? "text-sky-300"
                              : "text-emerald-300"
                        }
                      >
                        [{authorName}] {message.text}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-3 rounded-b-3xl border-t border-slate-700/60 bg-slate-900/70 px-6 py-4"
          >
            <span className="font-mono text-slate-400">mesh ❯</span>
            <input
              ref={inputRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="flex-1 bg-transparent font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none"
              placeholder="Type a command or message…"
              autoComplete="off"
            />
            <button
              type="submit"
              className="rounded-full border border-sky-500/80 bg-sky-500/20 px-4 py-1 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/40"
            >
              Send
            </button>
          </form>
        </div>
      </section>

      {manualOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div
            ref={manualRef}
            className="w-full max-w-3xl rounded-3xl border border-slate-700/60 bg-slate-950/95 p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-100">
                Mesh Operator Manual
              </h2>
              <button
                onClick={() => setManualOpen(false)}
                className="rounded-full border border-slate-700/60 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-500"
              >
                Close
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Establish secure channels with peers by exchanging UIDs. All
              sessions are transient and reset when the relay sleeps.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm uppercase tracking-wide text-slate-500">
                  Commands
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {COMMANDS.map((item) => (
                    <li key={item.command}>
                      <span className="font-mono text-sky-300">
                        {item.command}
                      </span>
                      <span className="text-slate-300"> — {item.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-wide text-slate-500">
                  Keybindings
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {KEYBINDS.map((binding) => (
                    <li key={binding.keys} className="flex justify-between">
                      <span>{binding.action}</span>
                      <span className="font-mono text-slate-400">
                        {binding.keys}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-slate-700/60 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Quick Start
              </p>
              <ol className="mt-3 space-y-2 text-sm text-slate-300">
                <li>
                  Share your UID with a peer. They must run the mesh to connect.
                </li>
                <li>
                  Run <span className="font-mono text-sky-300">connect &lt;uid&gt;</span> on both sides.
                </li>
                <li>
                  Switch between sessions with{" "}
                  <span className="font-mono text-sky-300">switch</span>.
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
