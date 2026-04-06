"use client";

import { useState, createContext, useContext, useEffect, useRef } from "react";
import JSConfetti from "js-confetti";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Settings, GripVertical, Plus, X, Trash2 } from "lucide-react";

// ── Weather icons ────────────────────────────────────────────────────────────

type WeatherIconType = "sun" | "cloud-sun" | "cloud" | "cloud-rain" | "cloud-drizzle";

function WeatherIcon({ type, size = 28 }: { type: WeatherIconType; size?: number }) {
  const s = size;
  const Cloud = ({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) => (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="14" cy="20" rx="10" ry="7" fill="#C8D0DC" />
      <ellipse cx="10" cy="18" rx="7" ry="6" fill="#C8D0DC" />
      <ellipse cx="18" cy="17" rx="8" ry="6.5" fill="#C8D0DC" />
      <ellipse cx="14" cy="15" rx="7" ry="6" fill="#C8D0DC" />
      <ellipse cx="14" cy="21" rx="10" ry="4" fill="rgba(0,0,0,0.12)" />
    </g>
  );
  const Sun = ({ cx = 14, cy = 14, r = 5.5 }: { cx?: number; cy?: number; r?: number }) => {
    const rays = Array.from({ length: 8 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 8;
      const inner = r + 2.5;
      const outer = r + 5;
      return (
        <line key={i}
          x1={cx + Math.cos(angle) * inner} y1={cy + Math.sin(angle) * inner}
          x2={cx + Math.cos(angle) * outer} y2={cy + Math.sin(angle) * outer}
          stroke="#F6C842" strokeWidth="2" strokeLinecap="round" />
      );
    });
    return <g>{rays}<circle cx={cx} cy={cy} r={r} fill="#FAD234" /><circle cx={cx} cy={cy} r={r - 1} fill="#F6C842" opacity="0.5" /></g>;
  };
  switch (type) {
    case "sun": return <svg width={s} height={s} viewBox="0 0 28 28" fill="none"><Sun cx={14} cy={14} r={6} /></svg>;
    case "cloud-sun": return <svg width={s} height={s} viewBox="0 0 28 28" fill="none"><Sun cx={10} cy={10} r={5} /><Cloud x={0} y={4} scale={0.85} /></svg>;
    case "cloud": return <svg width={s} height={s} viewBox="0 0 28 28" fill="none"><Cloud x={0} y={2} /></svg>;
    case "cloud-rain": return <svg width={s} height={s} viewBox="0 0 28 28" fill="none"><Cloud x={0} y={0} scale={0.88} />{[8, 12, 16, 20].map((x, i) => <line key={i} x1={x} y1={21} x2={x - 2} y2={26} stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" />)}</svg>;
    case "cloud-drizzle": return <svg width={s} height={s} viewBox="0 0 28 28" fill="none"><Sun cx={9} cy={8} r={4.5} /><Cloud x={0} y={4} scale={0.82} />{[9, 14, 19].map((x, i) => <line key={i} x1={x} y1={22} x2={x - 1.5} y2={26} stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />)}</svg>;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

type Priority = "High" | "Medium" | "Low";
type TaskCategory = "work" | "personal" | "sport";

interface Task {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  priority: Priority;
  done: boolean;
  hasCalendarDot?: boolean;
  miles?: number;
  date?: string;
  deadline?: string;
}

const priorityStyles: Record<Priority, { bg: string; text: string }> = {
  High:   { bg: "bg-[#fee2e2]", text: "text-[#dc2626]" },
  Medium: { bg: "bg-[#fefce8]", text: "text-[#d08700]" },
  Low:    { bg: "bg-[#f7fee7]", text: "text-[#008236]" },
};

// ── Contexts ─────────────────────────────────────────────────────────────────

const ActiveTabContext = createContext<"Today" | "Week" | "Month">("Today");
const SettingsContext  = createContext<Record<string, boolean>>({});

interface TasksCtxValue {
  workTasks: Task[];
  personalTasks: Task[];
  sportTasks: Task[];
  toggleTask: (cat: TaskCategory, id: string) => void;
  openTask:   (task: Task, cat: TaskCategory) => void;
}
const TasksContext = createContext<TasksCtxValue>({
  workTasks: [], personalTasks: [], sportTasks: [],
  toggleTask: () => {}, openTask: () => {},
});

const UnitsContext = createContext<{ metric: boolean }>({ metric: false });

// ── Demo data ─────────────────────────────────────────────────────────────────

const INITIAL_WORK_TASKS: Task[] = [
  { id: "w1", title: "Salary review meeting",       priority: "High",   done: false },
  { id: "w2", title: "Finalize Q2 roadmap",          priority: "High",   done: false },
  { id: "w3", title: "Review design specifications", priority: "Medium", done: false },
  { id: "w4", title: "Update Jira tickets",          priority: "Low",    done: false },
];

const INITIAL_PERSONAL_TASKS: Task[] = [
  { id: "p1", title: "Pay rent",          priority: "High",   done: false },
  { id: "p2", title: "Grocery shopping",  priority: "Medium", done: false },
  { id: "p3", title: "Call mom",          priority: "Medium", done: false },
];

const INITIAL_SPORT_TASKS: Task[] = [
  { id: "s1", title: "Interval Run", subtitle: "5 mi total", priority: "High",   done: false, hasCalendarDot: true, miles: 5 },
  { id: "s2", title: "Mobility and stretching",               priority: "Medium", done: false },
];

// ── Inbox emails ──────────────────────────────────────────────────────────────

interface Email {
  from: string;
  subject: string;
  preview: string;
  body: string;
}

const INBOX_EMAILS: Email[] = [
  {
    from: "sarah.chen@company.com",
    subject: "Q2 Deck Review",
    preview: "Hey Alex, can you review the Q2 deck before EOD?",
    body: "Hey Alex,\n\nI wanted to check in on the Q2 strategy deck. Could you review it before end of day and share any feedback? The stakeholder meeting is tomorrow morning at 9 AM and I want to make sure we're aligned on the key messaging.\n\nThe deck covers Q2 OKRs, feature roadmap, and resource allocation. It should take about 20 minutes to review.\n\nLet me know if you have any questions.\n\nBest,\nSarah",
  },
  {
    from: "mike.r@agency.io",
    subject: "Proposal Timeline Update",
    preview: "Following up on the proposal — any updates on timeline?",
    body: "Hi Alex,\n\nJust following up on the proposal we sent over last week. We're planning our Q2 schedule and it would really help to know if you have any updates on the timeline or budget approval.\n\nWe're flexible on start date and can adjust the scope if needed. Happy to jump on a quick call this week if that's easier.\n\nThanks,\nMike",
  },
  {
    from: "team@notion.so",
    subject: "Unread Comments — Product Roadmap Q2",
    preview: "You have 3 unread comments in Product Roadmap Q2.",
    body: "Hi Alex,\n\nYou have 3 unread comments in the Product Roadmap Q2 page:\n\n• Jordan Lee commented on \"Feature Launch Timeline\": \"Should we move the date to April 28?\"\n\n• Priya Sharma commented on \"Resource Allocation\": \"I can take the UX audit off your plate.\"\n\n• David Kim commented on \"Risk Assessment\": \"Flagged two items that need your sign-off.\"\n\nView the page to respond.\n\n— The Notion Team",
  },
];

// ── Small components ──────────────────────────────────────────────────────────

function Checkbox({ done }: { done: boolean }) {
  if (done) return (
    <div className="w-4 h-4 shrink-0 rounded-[2px] bg-black flex items-center justify-center">
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
  return <div className="w-4 h-4 shrink-0 rounded-[2px] border border-[#d9d9d9]" />;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const { bg, text } = priorityStyles[priority];
  return <span className={`${bg} ${text} text-[11px] font-medium px-2 py-[2px] rounded-[4px] leading-[1.5] tracking-[-0.1px]`}>{priority}</span>;
}

function TaskRow({ task, last, onToggle, onOpen }: { task: Task; last?: boolean; onToggle?: (id: string) => void; onOpen?: (task: Task) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-[6px]">
        <div className="flex gap-3 items-center w-full">
          <button onClick={() => onToggle?.(task.id)} className="shrink-0">
            <Checkbox done={task.done} />
          </button>
          <button onClick={() => onOpen?.(task)} className="flex-1 min-w-0 text-left cursor-pointer">
            <span className={`text-[13px] font-medium leading-[1.3] tracking-[-0.2px] transition-opacity ${task.done ? "line-through opacity-30" : ""}`}>
              {task.title}
            </span>
            {task.subtitle && (
              <p className={`text-[11px] leading-[1.3] mt-0.5 truncate transition-opacity ${task.done ? "opacity-20" : "text-black/40"}`}>{task.subtitle}</p>
            )}
          </button>
        </div>
        <div className="pl-7"><PriorityBadge priority={task.priority} /></div>
      </div>
      {!last && <div className="h-px bg-[rgba(217,217,217,0.35)]" />}
    </div>
  );
}

function ProgressRing({ value, max, label }: { value: number; max: number; label: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? value / max : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="5" />
          <circle cx="36" cy="36" r={r} fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[13px] font-semibold leading-none">{value}</span>
          <span className="text-[10px] text-black/40 leading-none mt-0.5">/ {max}</span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-black/50 tracking-wide uppercase">{label}</span>
    </div>
  );
}

function useConfetti() {
  const ref = useRef<JSConfetti | null>(null);
  useEffect(() => { ref.current = new JSConfetti(); return () => { ref.current = null; }; }, []);
  return () => ref.current?.addConfetti({ confettiColors: ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#60a5fa", "#a78bfa", "#f472b6"] });
}

// ── Weather ───────────────────────────────────────────────────────────────────

function wmoToIcon(code: number): { icon: WeatherIconType; label: string } {
  if (code === 0)  return { icon: "sun",           label: "Clear Sky" };
  if (code <= 2)   return { icon: "cloud-sun",     label: "Partly Cloudy" };
  if (code <= 3)   return { icon: "cloud",         label: "Overcast" };
  if (code <= 48)  return { icon: "cloud",         label: "Foggy" };
  if (code <= 57)  return { icon: "cloud-drizzle", label: "Drizzle" };
  if (code <= 67)  return { icon: "cloud-rain",    label: "Rain" };
  if (code <= 77)  return { icon: "cloud",         label: "Snow" };
  if (code <= 82)  return { icon: "cloud-rain",    label: "Rain Showers" };
  return { icon: "cloud-rain", label: "Stormy" };
}

function DailyBriefContent() {
  const settings = useContext(SettingsContext);
  const [weather, setWeather] = useState<{ temp: number; windspeed: number; icon: WeatherIconType; label: string } | null>(null);

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=34.0522&longitude=-118.2437&current_weather=true&temperature_unit=celsius&windspeed_unit=kmh")
      .then((r) => r.json())
      .then((data) => {
        const cw = data.current_weather;
        const { icon, label } = wmoToIcon(cw.weathercode);
        setWeather({ temp: Math.round(cw.temperature), windspeed: Math.round(cw.windspeed), icon, label });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] md:text-[14px] font-normal text-black/80 leading-[1.5] max-w-[340px]">
          Alex, you have two high-priority work tasks and one personal high-priority task today. You also have 3 emails waiting for a response.
        </p>
      </div>
      {settings["Show weather"] && (
        <div className="flex items-start gap-3 shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[12px] md:text-[13px] text-black/40 leading-normal">Los Angeles</span>
            <span className="text-[30px] md:text-[36px] font-medium text-black leading-none">
              {weather ? `${weather.temp}°` : "—"}
            </span>
          </div>
          <div className="w-px h-12 bg-[#f0eeee] self-center" />
          <div className="flex flex-col gap-1 justify-center">
            <WeatherIcon type={weather?.icon ?? "sun"} size={18} />
            <span className="text-[12px] md:text-[13px] text-black/40 leading-none">{weather?.label ?? "Loading…"}</span>
            <span className="text-[11px] font-semibold text-black">{weather ? `${weather.windspeed} km/h` : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

function InboxContent({ onEmailClick }: { onEmailClick: (email: Email) => void }) {
  return (
    <div className="flex flex-col">
      {INBOX_EMAILS.map((email, i) => (
        <div key={i} className="flex flex-col">
          <button
            onClick={() => onEmailClick(email)}
            className="flex flex-col gap-[3px] py-3 text-left hover:bg-black/[0.02] rounded-[6px] px-1 -mx-1 transition-colors"
          >
            <span className="text-[12px] font-semibold text-black leading-none">{email.from}</span>
            <span className="text-[12px] text-black/40 leading-[1.4]">{email.preview}</span>
          </button>
          {i < INBOX_EMAILS.length - 1 && <div className="h-px bg-[rgba(217,217,217,0.35)]" />}
        </div>
      ))}
    </div>
  );
}

// ── Task content components ───────────────────────────────────────────────────

function WorkContent() {
  const { workTasks, toggleTask, openTask } = useContext(TasksContext);
  const fireConfetti = useConfetti();
  const tasks = [...workTasks].sort((a, b) => Number(a.done) - Number(b.done));
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  const prevAllDone = useRef(false);
  useEffect(() => { if (allDone && !prevAllDone.current) fireConfetti(); prevAllDone.current = allDone; }, [allDone]);
  if (tasks.length === 0) return (
    <div className="flex flex-col gap-1 py-4">
      <p className="text-[13px] text-black/40">No tasks for today. Enjoy your free time.</p>
      <p className="text-[12px] text-black/25">Add your first task to get started</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} last={i === tasks.length - 1}
          onToggle={(id) => toggleTask("work", id)}
          onOpen={(t) => openTask(t, "work")} />
      ))}
    </div>
  );
}

function PersonalContent() {
  const { personalTasks, toggleTask, openTask } = useContext(TasksContext);
  const fireConfetti = useConfetti();
  const tasks = [...personalTasks].sort((a, b) => Number(a.done) - Number(b.done));
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  const prevAllDone = useRef(false);
  useEffect(() => { if (allDone && !prevAllDone.current) fireConfetti(); prevAllDone.current = allDone; }, [allDone]);
  if (tasks.length === 0) return (
    <div className="flex flex-col gap-1 py-4">
      <p className="text-[13px] text-black/40">No tasks for today. Enjoy your free time.</p>
      <p className="text-[12px] text-black/25">Add your first task to get started</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} last={i === tasks.length - 1}
          onToggle={(id) => toggleTask("personal", id)}
          onOpen={(t) => openTask(t, "personal")} />
      ))}
    </div>
  );
}

const SPORT_TASK_IDS_BY_DOW: Record<number, string[]> = {
  0: [],
  1: ["s1", "s2"],
  2: ["s1"],
  3: ["s2"],
  4: [],
  5: ["s1"],
  6: ["s1"],
};

function SportContent() {
  const activeTab = useContext(ActiveTabContext);
  const settings  = useContext(SettingsContext);
  const { metric } = useContext(UnitsContext);
  const { sportTasks, toggleTask, openTask } = useContext(TasksContext);
  const fireConfetti = useConfetti();
  const tasks = [...sportTasks].sort((a, b) => Number(a.done) - Number(b.done));

  const runningOn = settings["Running"] ?? true;

  const gymDone  = tasks.filter((t) => t.done && !t.miles).length;
  const runMiRaw = tasks.filter((t) => t.done && t.miles).reduce((s, t) => s + (t.miles ?? 0), 0);
  const totalMiRaw = tasks.filter((t) => t.miles).reduce((s, t) => s + (t.miles ?? 0), 0);

  const convert = (mi: number) => metric ? parseFloat((mi * 1.60934).toFixed(1)) : mi;
  const runVal   = convert(runMiRaw);
  const totalVal = convert(totalMiRaw);
  const unitLabel = metric ? "km" : "mi";

  const todayDow = new Date().getDay();
  const todayIds = SPORT_TASK_IDS_BY_DOW[todayDow] ?? [];
  const allVisible = activeTab === "Today" ? tasks.filter((t) => todayIds.includes(t.id)) : tasks;

  // Filter out running tasks when Running is off
  const visible = runningOn ? allVisible : allVisible.filter((t) => !t.miles);

  const allVisibleDone = visible.length > 0 && visible.every((t) => t.done);
  const prevVisibleDone = useRef(false);
  useEffect(() => { if (allVisibleDone && !prevVisibleDone.current) fireConfetti(); prevVisibleDone.current = allVisibleDone; }, [allVisibleDone]);

  return (
    <>
      <div className="flex gap-6 items-center flex-wrap">
        <ProgressRing value={gymDone} max={3} label="GYM" />
        {runningOn && (
          <>
            <div className="h-10 w-px bg-black/[0.08]" />
            <ProgressRing value={runVal} max={totalVal || 1} label={`RUN ${unitLabel}`} />
          </>
        )}
      </div>
      <div className="flex flex-col gap-3 mt-1">
        {visible.length === 0 ? (
          <p className="text-[13px] text-black/30 text-center py-4">No training today 🌿</p>
        ) : (
          visible.map((task, i) => (
            <TaskRow key={task.id} task={task} last={i === visible.length - 1}
              onToggle={(id) => toggleTask("sport", id)}
              onOpen={(t) => openTask(t, "sport")} />
          ))
        )}
      </div>
    </>
  );
}

function QuickNoteContent() {
  const [text, setText] = useState("");
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Start typing..."
      rows={4}
      className="w-full resize-none bg-black/[0.03] rounded-[8px] px-3 py-2.5 text-[13px] leading-[1.5] placeholder:text-black/25 outline-none focus:ring-1 focus:ring-black/10 transition-all"
    />
  );
}

// ── Card system ───────────────────────────────────────────────────────────────

interface CardConfig {
  id: string;
  title: string;
  icon: React.ReactNode;
  countLabel?: string;
  badge?: React.ReactNode;
  content: React.ReactNode;
  span?: "full" | "half" | "auto";
}

const INITIAL_CARDS: CardConfig[] = [
  { id: "daily-brief", title: "Daily Overview", icon: null, content: null, span: "half" },
  { id: "inbox",       title: "Priority Inbox", icon: null, content: null, span: "half" },
  { id: "work",        title: "Work",     icon: null, content: <WorkContent />,     span: "auto" },
  { id: "personal",    title: "Personal", icon: null, content: <PersonalContent />, span: "auto" },
  { id: "sport",       title: "Sport",    icon: null, content: <SportContent />,    span: "auto" },
  { id: "quick-note",  title: "Quick Note", icon: null, content: <QuickNoteContent />, span: "auto" },
];

function CardShell({
  card, dragHandleProps, isDragging, compact, onEmailClick,
}: {
  card: CardConfig;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
  compact?: boolean;
  onEmailClick?: (e: Email) => void;
}) {
  let content = card.content;
  if (card.id === "daily-brief") content = <DailyBriefContent />;
  if (card.id === "inbox")       content = <InboxContent onEmailClick={onEmailClick ?? (() => {})} />;

  return (
    <div className={`backdrop-blur-[32px] bg-[rgba(255,255,255,0.8)] rounded-[12px] flex flex-col overflow-hidden h-full transition-shadow ${
      compact ? "p-4 gap-[18px]" : "p-6 gap-[28px]"
    } ${isDragging ? "shadow-2xl shadow-black/15 ring-1 ring-black/10" : "shadow-none"}`}>
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {card.icon}
          <span className="text-[15px] md:text-[18px] font-semibold leading-[1.4] tracking-[-0.3px]">{card.title}</span>
          {card.countLabel && <span className="text-[12px] text-black/40 font-medium">{card.countLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          {card.badge}
          <div {...dragHandleProps} suppressHydrationWarning className="cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-black/5 transition-colors">
            <GripVertical size={18} className="text-black/25" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">{content}</div>
    </div>
  );
}

function SortableCard({ card, isDragging, compact, onEmailClick }: { card: CardConfig; isDragging?: boolean; compact?: boolean; onEmailClick?: (e: Email) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSelfDragging } = useSortable({ id: card.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isSelfDragging ? 0.35 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="w-full sm:flex-1 sm:min-w-[240px]">
      <CardShell card={card} dragHandleProps={{ ...attributes, ...listeners }} isDragging={isDragging} compact={compact} onEmailClick={onEmailClick} />
    </div>
  );
}

// ── Sortable task row for Week/Month views ────────────────────────────────────

type ViewTask = { _key: string; title: string; priority: Priority; category: string };

function SortableViewTaskRow({ task, last, done, onToggle, onOpen }: {
  task: ViewTask; last: boolean; done: boolean;
  onToggle: () => void; onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task._key });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 w-full">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 shrink-0">
          <GripVertical size={14} className="text-black/20" />
        </div>
        <button onClick={onToggle} className="shrink-0"><Checkbox done={done} /></button>
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <span className={`text-[13px] font-medium leading-[1.3] tracking-[-0.2px] transition-opacity ${done ? "line-through opacity-30" : ""}`}>{task.title}</span>
          <span className="ml-2 text-[11px] text-black/30">{task.category}</span>
        </button>
        <PriorityBadge priority={task.priority} />
      </div>
      {!last && <div className="h-px bg-[rgba(217,217,217,0.35)]" />}
    </div>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────

const WEEK_TASKS: Record<number, { title: string; priority: Priority; category: string }[]> = {
  0: [
    { title: "Weekly planning",       priority: "High",   category: "Personal" },
    { title: "Meal prep",             priority: "Medium", category: "Personal" },
    { title: "Call family",           priority: "Medium", category: "Personal" },
    { title: "Stretching and mobility", priority: "Low",  category: "Sport" },
  ],
  1: [
    { title: "Sprint Planning Meeting",       priority: "High",   category: "Work" },
    { title: "Finalize Q2 roadmap",           priority: "High",   category: "Work" },
    { title: "Review design specifications",  priority: "Medium", category: "Work" },
    { title: "Pay rent",                      priority: "High",   category: "Personal" },
    { title: "Grocery shopping",              priority: "Medium", category: "Personal" },
    { title: "Interval Run (5 mi)",           priority: "High",   category: "Sport" },
    { title: "Mobility and stretching",       priority: "Medium", category: "Sport" },
  ],
  2: [
    { title: "Deep work: roadmap finalization", priority: "High",   category: "Work" },
    { title: "Product sync with design",        priority: "Medium", category: "Work" },
    { title: "Grocery shopping",               priority: "Medium", category: "Personal" },
    { title: "Easy run (4 mi)",                priority: "Medium", category: "Sport" },
    { title: "Core workout",                   priority: "Low",    category: "Sport" },
  ],
  3: [
    { title: "Team sync meeting",          priority: "High",   category: "Work" },
    { title: "Stakeholder alignment call", priority: "High",   category: "Work" },
    { title: "Review sprint backlog",      priority: "Medium", category: "Work" },
    { title: "Dentist appointment",        priority: "High",   category: "Personal" },
    { title: "Strength training",          priority: "Medium", category: "Sport" },
  ],
  4: [
    { title: "Prepare product demo",   priority: "High",   category: "Work" },
    { title: "Rehearse presentation",  priority: "High",   category: "Work" },
    { title: "Review slides",          priority: "Medium", category: "Work" },
    { title: "Pay utilities",          priority: "Medium", category: "Personal" },
  ],
  5: [
    { title: "Product demo to stakeholders", priority: "High",   category: "Work" },
    { title: "Follow-up emails",             priority: "High",   category: "Work" },
    { title: "Team debrief",                 priority: "Medium", category: "Work" },
    { title: "Easy recovery run (3 mi)",     priority: "Low",    category: "Sport" },
  ],
  6: [
    { title: "Long run (9 mi)",    priority: "High", category: "Sport" },
    { title: "Grocery shopping",   priority: "Low",  category: "Personal" },
    { title: "Clean apartment",    priority: "Low",  category: "Personal" },
  ],
};

const WEEK_FORECAST: Record<number, { icon: WeatherIconType; high: number; low: number }> = {
  0: { icon: "cloud-sun",    high: 14, low: 7 },
  1: { icon: "cloud-sun",    high: 16, low: 8 },
  2: { icon: "cloud",        high: 13, low: 6 },
  3: { icon: "cloud-rain",   high: 10, low: 5 },
  4: { icon: "cloud-drizzle",high: 12, low: 6 },
  5: { icon: "sun",          high: 17, low: 9 },
  6: { icon: "sun",          high: 19, low: 10 },
};

function WeekView({ today, onOpen }: { today: Date; onOpen: (task: Task, cat: TaskCategory) => void }) {
  const [selectedDay, setSelectedDay] = useState(today.getDay());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [taskOrders, setTaskOrders] = useState<Record<number, string[]>>({});
  const toggleDone = (key: string) =>
    setDone((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const rawTasks: ViewTask[] = (WEEK_TASKS[selectedDay] ?? []).map((t, i) => ({ ...t, _key: `w-${selectedDay}-${i}` }));
  const order = taskOrders[selectedDay];
  const tasks = order
    ? order.map((k) => rawTasks.find((t) => t._key === k)).filter(Boolean) as ViewTask[]
    : rawTasks;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = tasks.map((t) => t._key);
    const oi = ids.indexOf(active.id as string);
    const ni = ids.indexOf(over.id as string);
    setTaskOrders((prev) => ({ ...prev, [selectedDay]: arrayMove(ids, oi, ni) }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="backdrop-blur-[32px] bg-[rgba(255,255,255,0.8)] rounded-[12px] p-3 md:p-4 overflow-x-auto">
        <div className="flex gap-1 md:gap-2 min-w-max md:min-w-0">
          {days.map((d, i) => {
            const isToday    = d.toDateString() === today.toDateString();
            const isSelected = selectedDay === i;
            const taskCount  = (WEEK_TASKS[i] ?? []).length;
            return (
              <button key={i} onClick={() => setSelectedDay(i)}
                className={`flex-1 flex flex-col items-center gap-1.5 md:gap-2 py-2 md:py-3 px-2 rounded-[10px] transition-colors min-w-[44px] ${
                  isSelected ? "bg-black text-white" : "hover:bg-black/5 text-black"
                }`}>
                <span className={`text-[10px] md:text-[11px] font-medium uppercase tracking-wider ${isSelected ? "text-white/60" : "text-black/40"}`}>
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className={`text-[16px] md:text-[20px] font-semibold leading-none ${isToday && !isSelected ? "text-black" : ""}`}>
                  {d.getDate()}
                </span>
                <WeatherIcon type={WEEK_FORECAST[i]?.icon ?? "cloud"} size={20} />
                <span className={`text-[11px] font-medium leading-none ${isSelected ? "text-white/70" : "text-black/50"}`}>
                  {WEEK_FORECAST[i]?.high}°
                </span>
                {taskCount > 0
                  ? <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/60" : "bg-black/20"}`} />
                  : <div className="w-1.5 h-1.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="backdrop-blur-[32px] bg-[rgba(255,255,255,0.8)] rounded-[12px] p-4 md:p-6">
        <p className="text-[11px] md:text-[12px] text-black/40 font-semibold uppercase tracking-wider mb-5">
          {days[selectedDay]?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 opacity-30">
            <span className="text-[32px]">✓</span>
            <span className="text-[14px] font-medium">Nothing scheduled</span>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tasks.map((t) => t._key)} strategy={rectSortingStrategy}>
              <div className="flex flex-col gap-4">
                {tasks.map((t, i) => (
                  <SortableViewTaskRow key={t._key} task={t} last={i === tasks.length - 1}
                    done={done.has(t._key)}
                    onToggle={() => toggleDone(t._key)}
                    onOpen={() => onOpen({ id: t._key, title: t.title, priority: t.priority, done: done.has(t._key) }, ({ Work: "work", Personal: "personal", Sport: "sport" } as Record<string, TaskCategory>)[t.category] ?? "work")} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({ today, onOpen }: { today: Date; onOpen: (task: Task, cat: TaskCategory) => void }) {
  const [viewDate, setViewDate]     = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [done, setDone]             = useState<Set<string>>(new Set());
  const [taskOrders, setTaskOrders] = useState<Record<string, string[]>>({});
  const toggleDone = (key: string) =>
    setDone((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const mSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } })
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  const cells: { day: number; cur: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: daysInPrev - firstDow + 1 + i, cur: false });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, cur: true });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - firstDow + 1, cur: false });

  const taskDays = new Set(Object.entries(WEEK_TASKS).filter(([, v]) => v.length > 0).map(([k]) => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay() + Number(k));
    return d.getDate();
  }));

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="backdrop-blur-[32px] bg-[rgba(255,255,255,0.8)] rounded-[12px] p-4 md:p-6 flex-1">
        <div className="flex items-center justify-between mb-6">
          <span className="text-[16px] md:text-[18px] font-semibold tracking-[-0.3px]">
            {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="w-8 h-8 flex items-center justify-center rounded-[8px] hover:bg-black/5 text-black/50 transition-colors text-[18px] leading-none">‹</button>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="w-8 h-8 flex items-center justify-center rounded-[8px] hover:bg-black/5 text-black/50 transition-colors text-[18px] leading-none">›</button>
          </div>
        </div>
        <div className="grid grid-cols-7 mb-2">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="text-center text-[10px] md:text-[11px] font-semibold text-black/30 uppercase tracking-wider py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            const isToday    = cell.cur && cell.day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const isSelected = cell.cur && cell.day === selectedDate;
            const hasTasks   = cell.cur && taskDays.has(cell.day);
            return (
              <button key={i} onClick={() => cell.cur && setSelectedDate(cell.day)} disabled={!cell.cur}
                className={`aspect-square flex flex-col items-center justify-center rounded-[8px] transition-colors relative ${
                  !cell.cur   ? "text-black/15 cursor-default" :
                  isSelected  ? "bg-black text-white" :
                  isToday     ? "ring-1 ring-black/20 text-black hover:bg-black/5" :
                                "text-black hover:bg-black/5"
                }`}>
                <span className={`text-[12px] md:text-[13px] ${isSelected ? "font-bold" : "font-medium"}`}>{cell.day}</span>
                {hasTasks && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-black/30" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="backdrop-blur-[32px] bg-[rgba(255,255,255,0.8)] rounded-[12px] p-4 md:p-6 md:w-[300px] shrink-0">
        <p className="text-[11px] md:text-[12px] text-black/40 font-semibold uppercase tracking-wider mb-5">
          {new Date(year, month, selectedDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        {(() => {
          const dow = new Date(year, month, selectedDate).getDay();
          const dateKey = `${year}-${month}-${selectedDate}`;
          const rawTasks: ViewTask[] = (WEEK_TASKS[dow] ?? []).map((t, i) => ({ ...t, _key: `m-${dateKey}-${i}` }));
          const order = taskOrders[dateKey];
          const mTasks = order
            ? order.map((k) => rawTasks.find((t) => t._key === k)).filter(Boolean) as ViewTask[]
            : rawTasks;
          function handleMonthDragEnd(e: DragEndEvent) {
            const { active, over } = e;
            if (!over || active.id === over.id) return;
            const ids = mTasks.map((t) => t._key);
            setTaskOrders((prev) => ({ ...prev, [dateKey]: arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string)) }));
          }
          return mTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-30">
              <span className="text-[28px]">✓</span>
              <span className="text-[13px] font-medium">Nothing scheduled</span>
            </div>
          ) : (
            <DndContext sensors={mSensors} collisionDetection={closestCenter} onDragEnd={handleMonthDragEnd}>
              <SortableContext items={mTasks.map((t) => t._key)} strategy={rectSortingStrategy}>
                <div className="flex flex-col gap-4">
                  {mTasks.map((t, i) => (
                    <SortableViewTaskRow key={t._key} task={t} last={i === mTasks.length - 1}
                      done={done.has(t._key)}
                      onToggle={() => toggleDone(t._key)}
                      onOpen={() => onOpen({ id: t._key, title: t.title, priority: t.priority, done: done.has(t._key) }, ({ Work: "work", Personal: "personal", Sport: "sport" } as Record<string, TaskCategory>)[t.category] ?? "work")} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          );
        })()}
      </div>
    </div>
  );
}

// ── Add Task suggestions ──────────────────────────────────────────────────────

const TASK_SUGGESTIONS: Record<string, string[]> = {
  Work:     ["Meeting", "Do task", "Send message / email", "Social media post"],
  Personal: ["Grocery", "Clean up", "Laundry", "Nails", "Doctor", "Dentist", "Hair", "Taxes", "Rent", "Bills"],
  Sport:    ["Lower body", "Upper body", "Full body", "Easy run", "Long run", "Tempo / Interval", "Race"],
};

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const today   = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Task state — lifted so detail panel can mutate
  const [workTasks,     setWorkTasks]     = useState<Task[]>(INITIAL_WORK_TASKS);
  const [personalTasks, setPersonalTasks] = useState<Task[]>(INITIAL_PERSONAL_TASKS);
  const [sportTasks,    setSportTasks]    = useState<Task[]>(INITIAL_SPORT_TASKS);

  function getSetterForCat(cat: TaskCategory) {
    return cat === "work" ? setWorkTasks : cat === "personal" ? setPersonalTasks : setSportTasks;
  }
  function toggleTask(cat: TaskCategory, id: string) {
    getSetterForCat(cat)((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }
  function updateTask(cat: TaskCategory, updated: Task) {
    getSetterForCat(cat)((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }
  function deleteTask(cat: TaskCategory, id: string) {
    getSetterForCat(cat)((prev) => prev.filter((t) => t.id !== id));
  }

  // Detail panel
  const [selectedTask, setSelectedTask] = useState<(Task & { category: TaskCategory }) | null>(null);
  const [editTask,     setEditTask]     = useState<(Task & { category: TaskCategory }) | null>(null);

  function openTask(task: Task, cat: TaskCategory) {
    const t = { ...task, category: cat };
    setSelectedTask(t);
    setEditTask(t);
  }
  function closeTaskPanel() { setSelectedTask(null); setEditTask(null); }
  function saveTask() {
    if (!editTask) return;
    updateTask(editTask.category, editTask);
    closeTaskPanel();
  }
  function handleDeleteTask() {
    if (!selectedTask) return;
    deleteTask(selectedTask.category, selectedTask.id);
    closeTaskPanel();
  }

  // Email popup
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  // Cards + drag
  const [cards,    setCards]    = useState(INITIAL_CARDS);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Tabs + UI
  const [activeTab,    setActiveTab]    = useState<"Today" | "Week" | "Month">("Today");
  const [showAdd,      setShowAdd]      = useState(false);
  const todayStr = today.toISOString().split("T")[0];
  const [newTask,    setNewTask]    = useState({ title: "", description: "", category: "Work", priority: "Medium" as Priority, date: todayStr, deadline: "" });
  const [extraTasks, setExtraTasks] = useState<(typeof newTask & { id: string })[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const [settingsToggles, setSettingsToggles] = useState<Record<string, boolean>>({
    "Google Calendar": true,
    "Notion":          false,
    "Compact mode":    false,
    "Show weather":    true,
    "Show inbox":      true,
    "Daily brief":     true,
    "Running":         true,
    "Metric units":    false,
  });
  const toggleSetting = (name: string) => setSettingsToggles((prev) => ({ ...prev, [name]: !prev[name] }));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );
  function handleDragStart(e: DragStartEvent) { setActiveId(e.active.id as string); }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (over && active.id !== over.id) {
      setCards((items) => {
        const oi = items.findIndex((c) => c.id === active.id);
        const ni = items.findIndex((c) => c.id === over.id);
        return arrayMove(items, oi, ni);
      });
    }
  }
  const activeCard = cards.find((c) => c.id === activeId);

  // Header computation
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekRangeStr = `${weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })} \u2013 ${weekEnd.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
  const monthStr     = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const headerTitle  = activeTab === "Today" ? "Day" : activeTab === "Week" ? "Week" : "Month";
  const headerSub    = activeTab === "Today" ? dateStr  : activeTab === "Week" ? weekRangeStr : monthStr;

  const tasksCtxValue: TasksCtxValue = { workTasks, personalTasks, sportTasks, toggleTask, openTask };

  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      {/* Background */}
      <div className="absolute pointer-events-none inset-0"
        style={{ background: "linear-gradient(180deg, #F8F6F8 0%, #F0DCD8 74.25%, #BAB9C2 103.49%)" }} />

      <div className="relative z-10 px-4 sm:px-8 md:px-12 py-6 md:py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6 md:mb-7">
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] sm:text-[32px] md:text-[38px] font-semibold leading-[1.2] tracking-[-0.5px]">{headerTitle}</h1>
            <p className="text-[13px] md:text-[14px] text-black/40 font-normal">{headerSub}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab switcher — always visible */}
            <div className="flex items-center bg-black/5 rounded-[8px] p-[3px]">
              {(["Today", "Week", "Month"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 md:px-4 py-1.5 text-[12px] md:text-[13px] font-medium rounded-[6px] transition-colors ${
                    activeTab === tab ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black/70"
                  }`}>
                  {tab}
                </button>
              ))}
            </div>
            {/* Add + Settings — always top right */}
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] md:text-[13px] font-medium text-black/60 bg-black/5 rounded-[8px] hover:bg-black/10 transition-colors">
              <Plus size={13} />
              Add
            </button>
            <button onClick={() => setShowSettings(true)}
              className="w-9 h-9 flex items-center justify-center rounded-[8px] hover:bg-black/5 transition-colors">
              <Settings size={16} className="text-black/50" />
            </button>
          </div>
        </div>

        {/* Today view */}
        {activeTab === "Today" && (
          <UnitsContext.Provider value={{ metric: settingsToggles["Metric units"] ?? false }}>
          <TasksContext.Provider value={tasksCtxValue}>
          <SettingsContext.Provider value={settingsToggles}>
          <ActiveTabContext.Provider value={activeTab}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {(() => {
              const taskCountLabel = (tasks: Task[]) => {
                const left = tasks.filter((t) => !t.done).length;
                return `${left}/${tasks.length} left`;
              };
              const countLabels: Record<string, string> = {
                work:     taskCountLabel(workTasks),
                personal: taskCountLabel(personalTasks),
                sport:    taskCountLabel(sportTasks),
              };
              const visibleCards = cards.filter((c) => {
                if (c.id === "daily-brief" && !settingsToggles["Daily brief"]) return false;
                if (c.id === "inbox"       && !settingsToggles["Show inbox"])   return false;
                return true;
              }).map((c) => countLabels[c.id] ? { ...c, countLabel: countLabels[c.id] } : c);
              const topCards    = visibleCards.filter((c) => c.id === "daily-brief" || c.id === "inbox");
              const bottomCards = visibleCards.filter((c) => c.id !== "daily-brief" && c.id !== "inbox");
              const gap = settingsToggles["Compact mode"] ? "gap-2" : "gap-3 md:gap-4";
              return (
                <div className={`flex flex-col ${gap}`}>
                  <SortableContext items={topCards.map((c) => c.id)} strategy={rectSortingStrategy}>
                    <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                      {topCards.map((card) => (
                        <SortableCard key={card.id} card={card} compact={settingsToggles["Compact mode"]} onEmailClick={setSelectedEmail} />
                      ))}
                    </div>
                  </SortableContext>
                  <SortableContext items={bottomCards.map((c) => c.id)} strategy={rectSortingStrategy}>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 md:gap-4 items-start">
                      {bottomCards.map((card) => (
                        <SortableCard key={card.id} card={card} compact={settingsToggles["Compact mode"]} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              );
            })()}
            <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
              {activeCard && (
                <div className="w-[280px] md:w-[320px]">
                  <CardShell card={activeCard} isDragging />
                </div>
              )}
            </DragOverlay>
          </DndContext>
          </ActiveTabContext.Provider>
          </SettingsContext.Provider>
          </TasksContext.Provider>
          </UnitsContext.Provider>
        )}

        {activeTab === "Week" && (
          <SettingsContext.Provider value={settingsToggles}>
            <WeekView today={today} onOpen={openTask} />
          </SettingsContext.Provider>
        )}

        {activeTab === "Month" && (
          <SettingsContext.Provider value={settingsToggles}>
            <MonthView today={today} onOpen={openTask} />
          </SettingsContext.Provider>
        )}
      </div>

      {/* ── Email popup ─────────────────────────────────────────────────────── */}
      {selectedEmail && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setSelectedEmail(null)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-[520px] bg-white rounded-[16px] shadow-2xl shadow-black/15 flex flex-col overflow-hidden max-h-[80vh]">
            <div className="flex items-start justify-between px-6 py-5 border-b border-black/[0.06]">
              <div className="flex flex-col gap-1 pr-4">
                <span className="text-[15px] font-semibold tracking-[-0.2px]">{selectedEmail.subject}</span>
                <span className="text-[12px] text-black/40">{selectedEmail.from}</span>
              </div>
              <button onClick={() => setSelectedEmail(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 text-black/30 hover:text-black/60 transition-colors shrink-0">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="text-[13px] text-black/70 leading-[1.7] whitespace-pre-wrap">{selectedEmail.body}</p>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06]">
              <a href={`mailto:${selectedEmail.from}`}
                className="flex items-center justify-center w-full py-2.5 bg-black text-white text-[13px] font-semibold rounded-[10px] hover:bg-black/80 transition-all">
                Reply
              </a>
            </div>
          </div>
        </>
      )}

      {/* ── Task detail / edit panel ─────────────────────────────────────────── */}
      {selectedTask && editTask && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeTaskPanel} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[400px] flex flex-col backdrop-blur-[40px] bg-[rgba(255,255,255,0.92)] border-l border-black/[0.06] shadow-2xl shadow-black/10">
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
              <span className="text-[17px] font-semibold tracking-[-0.3px]">Edit Task</span>
              <button onClick={closeTaskPanel} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 text-black/30 hover:text-black/60 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Task</label>
                <input
                  type="text"
                  value={editTask.title}
                  onChange={(e) => setEditTask((p) => p ? { ...p, title: e.target.value } : p)}
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[14px] font-medium placeholder:text-black/25 outline-none focus:ring-1 focus:ring-black/15 transition-all"
                />
              </div>
              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Description</label>
                <textarea
                  rows={3}
                  value={editTask.description ?? ""}
                  onChange={(e) => setEditTask((p) => p ? { ...p, description: e.target.value } : p)}
                  placeholder="Add notes..."
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[13px] placeholder:text-black/25 resize-none outline-none focus:ring-1 focus:ring-black/15 transition-all leading-[1.5]"
                />
              </div>
              {/* Priority */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Priority</label>
                <div className="flex gap-2">
                  {(["High", "Medium", "Low"] as const).map((p) => (
                    <button key={p} onClick={() => setEditTask((prev) => prev ? { ...prev, priority: p } : prev)}
                      className={`flex-1 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
                        editTask.priority === p
                          ? `${priorityStyles[p].bg} ${priorityStyles[p].text}`
                          : "bg-black/[0.04] text-black/40 hover:bg-black/[0.08]"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {/* Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={editTask.date ?? ""}
                  onChange={(e) => setEditTask((p) => p ? { ...p, date: e.target.value } : p)}
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[13px] font-medium outline-none focus:ring-1 focus:ring-black/15 transition-all"
                />
              </div>
              {/* Deadline */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Deadline <span className="normal-case font-normal text-black/25">(optional)</span></label>
                <input
                  type="date"
                  value={editTask.deadline ?? ""}
                  onChange={(e) => setEditTask((p) => p ? { ...p, deadline: e.target.value } : p)}
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[13px] font-medium outline-none focus:ring-1 focus:ring-black/15 transition-all"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex flex-col gap-2">
              <button onClick={saveTask}
                className="w-full py-2.5 bg-black text-white text-[13px] font-semibold rounded-[10px] hover:bg-black/80 transition-all">
                Save Changes
              </button>
              <button onClick={handleDeleteTask}
                className="w-full py-2.5 flex items-center justify-center gap-2 bg-[#fee2e2] text-[#dc2626] text-[13px] font-semibold rounded-[10px] hover:bg-[#fecaca] transition-all">
                <Trash2 size={14} />
                Delete Task
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Add Task panel ───────────────────────────────────────────────────── */}
      {showAdd && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowAdd(false)} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[400px] flex flex-col backdrop-blur-[40px] bg-[rgba(255,255,255,0.92)] border-l border-black/[0.06] shadow-2xl shadow-black/10">
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
              <span className="text-[17px] font-semibold tracking-[-0.3px]">Add Task</span>
              <button onClick={() => setShowAdd(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 text-black/30 hover:text-black/60 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
              {/* Task header */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Task</label>
                <input autoFocus type="text" placeholder="What needs to be done?"
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[14px] font-medium placeholder:text-black/25 outline-none focus:ring-1 focus:ring-black/15 transition-all"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Description</label>
                <textarea rows={3} placeholder="Add notes..."
                  value={newTask.description}
                  onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[13px] placeholder:text-black/25 resize-none outline-none focus:ring-1 focus:ring-black/15 transition-all leading-[1.5]"
                />
              </div>

              {/* Suggestions */}
              {TASK_SUGGESTIONS[newTask.category]?.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Suggested</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_SUGGESTIONS[newTask.category].map((s) => (
                      <button key={s} onClick={() => setNewTask((p) => ({ ...p, title: s }))}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                          newTask.title === s ? "bg-black text-white" : "bg-black/[0.05] text-black/60 hover:bg-black/[0.10]"
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Category</label>
                <div className="flex gap-2">
                  {(["Work", "Personal", "Sport"] as const).map((cat) => (
                    <button key={cat} onClick={() => setNewTask((p) => ({ ...p, category: cat, title: "" }))}
                      className={`flex-1 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
                        newTask.category === cat ? "bg-black text-white" : "bg-black/[0.04] text-black/50 hover:bg-black/[0.08]"
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Priority</label>
                <div className="flex gap-2">
                  {(["High", "Medium", "Low"] as const).map((p) => (
                    <button key={p} onClick={() => setNewTask((prev) => ({ ...prev, priority: p }))}
                      className={`flex-1 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
                        newTask.priority === p
                          ? `${priorityStyles[p].bg} ${priorityStyles[p].text}`
                          : "bg-black/[0.04] text-black/40 hover:bg-black/[0.08]"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Date</label>
                <input type="date"
                  value={newTask.date}
                  onChange={(e) => setNewTask((p) => ({ ...p, date: e.target.value }))}
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[13px] font-medium outline-none focus:ring-1 focus:ring-black/15 transition-all"
                />
              </div>

              {/* Deadline (optional) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Deadline <span className="normal-case font-normal text-black/25">(optional)</span></label>
                <input type="date"
                  value={newTask.deadline}
                  onChange={(e) => setNewTask((p) => ({ ...p, deadline: e.target.value }))}
                  className="w-full px-4 py-3 rounded-[10px] bg-black/[0.04] text-[13px] font-medium outline-none focus:ring-1 focus:ring-black/15 transition-all"
                />
              </div>

              {extraTasks.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Added</label>
                  {extraTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 bg-black/[0.03] rounded-[8px]">
                      <div className="w-3.5 h-3.5 rounded-[2px] border border-[#d9d9d9] shrink-0" />
                      <span className="text-[13px] font-medium flex-1">{t.title}</span>
                      <span className="text-[11px] text-black/30">{t.category}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06]">
              <button
                disabled={!newTask.title.trim()}
                onClick={() => {
                  if (!newTask.title.trim()) return;
                  setExtraTasks((prev) => [...prev, { ...newTask, id: `extra-${Date.now()}` }]);
                  setNewTask((p) => ({ ...p, title: "", description: "" }));
                }}
                className="w-full py-2.5 bg-black text-white text-[13px] font-semibold rounded-[10px] hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Add Task
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Settings panel ───────────────────────────────────────────────────── */}
      {showSettings && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[380px] flex flex-col backdrop-blur-[40px] bg-[rgba(255,255,255,0.92)] border-l border-black/[0.06] shadow-2xl shadow-black/10">
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-black/50" />
                <span className="text-[17px] font-semibold tracking-[-0.3px]">Settings</span>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 text-black/30 hover:text-black/60 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
              {[
                {
                  label: "Integrations",
                  items: [
                    { name: "Google Calendar", desc: "Sync events and meetings" },
                    { name: "Notion",          desc: "Two-way task sync" },
                  ],
                },
                {
                  label: "Appearance",
                  items: [
                    { name: "Compact mode", desc: "Reduce card padding" },
                    { name: "Show weather", desc: "Display weather widget" },
                    { name: "Show inbox",   desc: "Priority inbox card" },
                  ],
                },
                {
                  label: "Sport",
                  items: [
                    { name: "Running",      desc: "Show running tasks and progress" },
                    { name: "Metric units", desc: "Use km instead of miles" },
                  ],
                },
                {
                  label: "Notifications",
                  items: [
                    { name: "Daily brief", desc: "Morning summary at 8:00 AM" },
                  ],
                },
              ].map((section) => (
                <div key={section.label} className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold text-black/35 uppercase tracking-wider px-1">{section.label}</p>
                  <div className="bg-black/[0.035] rounded-[12px] overflow-hidden divide-y divide-black/[0.05]">
                    {section.items.map((item) => {
                      const on = settingsToggles[item.name] ?? false;
                      return (
                        <div key={item.name} className="flex items-center justify-between px-4 py-3">
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[13px] font-medium">{item.name}</span>
                            <span className="text-[11px] text-black/35">{item.desc}</span>
                          </div>
                          <button onClick={() => toggleSetting(item.name)}
                            className={`w-10 h-6 rounded-full relative transition-colors ${on ? "bg-black" : "bg-black/15"}`}>
                            <div className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200 ${on ? "left-[19px]" : "left-[3px]"}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
