import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, MessageSquare, MessageSquarePlus, Search, SendHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { useMe } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { listActiveUsers, listConversations, listMessages, markConversationRead, openDirectConversation, sendMessage } from '@/lib/api';
import { format } from 'date-fns';
import { shortStamp } from '@/lib/format';
import type { Message } from '@/lib/types';
import { Avatar, EmptyState, Modal, Spinner } from '@/components/ui';

function NewChatModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const me = useMe();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const users = useQuery({ queryKey: ['users', 'active'], queryFn: listActiveUsers, enabled: open });
  const start = useMutation({
    mutationFn: openDirectConversation,
    onSuccess: (id) => {
      onClose();
      navigate(`/chat/${id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const list = (users.data ?? [])
    .filter((u) => u.id !== me.id)
    .filter((u) => [u.full_name, u.email, u.designation].some((f) => f?.toLowerCase().includes(q.toLowerCase())));
  return (
    <Modal open={open} title="Start a conversation" onClose={onClose}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input className="input pl-9" autoFocus placeholder="Search colleagues…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="-mx-2 max-h-80 overflow-y-auto">
        {list.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => start.mutate(u.id)}
              disabled={start.isPending}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
            >
              <Avatar name={u.full_name} size="sm" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{u.full_name}</span>
                <span className="block truncate text-xs text-slate-500">{[u.designation, u.email].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
        {users.data && list.length === 0 && <li className="px-2 py-4 text-sm text-slate-400">No matching colleagues</li>}
      </ul>
    </Modal>
  );
}

function ChatThread({ conversationId }: { conversationId: string }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const { setActiveConversation } = useRealtime();
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: listConversations });
  const convo = conversations.data?.find((c) => c.conversation_id === conversationId);
  const messages = useQuery({ queryKey: ['messages', conversationId], queryFn: () => listMessages(conversationId) });

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  // Mark as read whenever there are unread incoming messages on screen.
  const hasUnread = messages.data?.some((m) => m.sender_id !== me.id && !m.read_at);
  useEffect(() => {
    if (!hasUnread) return;
    markConversationRead(conversationId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => undefined);
  }, [hasUnread, conversationId, queryClient]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(conversationId, me.id, body),
    onMutate: async (body) => {
      // Optimistic bubble so chat feels instant.
      const optimistic: Message = {
        id: `tmp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: me.id,
        body,
        created_at: new Date().toISOString(),
        read_at: null,
      };
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old = []) => [...old, optimistic]);
    },
    onError: (e, body) => {
      toast.error((e as Error).message);
      setText(body);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate(body);
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // group by day
  const grouped = useMemo(() => {
    const out: { day: string; items: Message[] }[] = [];
    for (const m of messages.data ?? []) {
      const day = format(new Date(m.created_at), 'EEEE, dd MMM yyyy');
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(m);
    }
    return out;
  }, [messages.data]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
        {convo && <Avatar name={convo.other_name} size="sm" />}
        <div>
          <div className="text-sm font-semibold text-navy-900">{convo?.other_name ?? '…'}</div>
          <div className="text-xs text-slate-500">{convo?.other_designation ?? ''}</div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-5 py-4">
        {messages.isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {grouped.map((g) => (
          <div key={g.day} className="space-y-1.5">
            <div className="my-3 text-center text-[11px] font-medium text-slate-400">{g.day}</div>
            {g.items.map((m) => {
              const mineMsg = m.sender_id === me.id;
              return (
                <div key={m.id} className={clsx('flex', mineMsg ? 'justify-end' : 'justify-start')}>
                  <div
                    className={clsx(
                      'max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                      mineMsg ? 'rounded-br-md bg-gradient-to-br from-brand-600 to-brand-500 text-white' : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200',
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={clsx('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mineMsg ? 'text-white/70' : 'text-slate-400')}>
                      {format(new Date(m.created_at), 'h:mm a')}
                      {mineMsg &&
                        (m.read_at ? (
                          <CheckCheck className="h-3 w-3 text-accent-300" aria-label="Read" />
                        ) : (
                          <Check className="h-3 w-3" aria-label="Sent" />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {messages.data?.length === 0 && <div className="py-10 text-center text-sm text-slate-400">Say hello 👋</div>}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-100 bg-white p-3">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={4000}
          placeholder="Type a message…  (Enter to send, Shift+Enter for a new line)"
          className="input max-h-32 min-h-[40px] resize-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 text-white transition hover:brightness-110 disabled:opacity-40"
          aria-label="Send"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: listConversations });

  const list = (conversations.data ?? []).filter((c) => c.other_name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="card -mx-2 -my-2 flex h-[calc(100vh-7rem)] overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-100">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h1 className="text-lg font-semibold text-navy-900">Chat</h1>
          <button onClick={() => setNewOpen(true)} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" title="New conversation">
            <MessageSquarePlus className="h-5 w-5" />
          </button>
        </div>
        <div className="relative px-4 pb-3">
          <Search className="pointer-events-none absolute left-7 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search conversations" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.map((c) => (
            <li key={c.conversation_id}>
              <button
                onClick={() => navigate(`/chat/${c.conversation_id}`)}
                className={clsx(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50',
                  c.conversation_id === conversationId && 'bg-brand-50/70',
                )}
              >
                <Avatar name={c.other_name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={clsx('truncate text-sm', c.unread_count > 0 ? 'font-semibold text-navy-900' : 'font-medium text-slate-800')}>{c.other_name}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{shortStamp(c.last_message_at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={clsx('truncate text-xs', c.unread_count > 0 ? 'text-slate-700' : 'text-slate-500')}>
                      {c.last_message ? `${c.last_sender_id === me.id ? 'You: ' : ''}${c.last_message}` : 'No messages yet'}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="min-w-[18px] rounded-full bg-accent-500 px-1.5 text-center text-[10px] font-semibold leading-[18px] text-navy-950">
                        {c.unread_count}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {conversations.data && list.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">
              No conversations yet.
              <button className="mt-1 block w-full font-medium text-brand-600 hover:underline" onClick={() => setNewOpen(true)}>
                Start one
              </button>
            </li>
          )}
        </ul>
      </aside>

      {conversationId ? (
        <ChatThread key={conversationId} conversationId={conversationId} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title="Select a conversation"
            text="Pick a colleague on the left, or start a new conversation."
          />
        </div>
      )}
      <NewChatModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
