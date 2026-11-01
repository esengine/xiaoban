import {
  failedText,
  intervalText,
  MIN_EVERY,
  markText,
  minuteText,
  NOTIFY_OPTIONS,
  notifyText,
  outputText,
  parseMinute,
  ruleText,
  runsText,
  SCHEDULE_WEEKDAYS,
  scheduleWhen,
  stateText,
  stopText,
} from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { RunMark, Schedule, ScheduleRule } from "@xiaoban/protocol";
import { type ReactNode, useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";

const INTERVALS = [30, 60, 120, 240, 360, 720];

export function ClockIcon() {
  return (
    <svg className="button-icon" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function minuteOf(rule: ScheduleRule): number {
  if (rule.kind === "once") {
    const at = new Date(rule.at);
    return at.getHours() * 60 + at.getMinutes();
  }
  if (rule.kind === "every") return rule.from ?? 8 * 60;
  return rule.minute;
}

function dayInput(ms: number): string {
  const at = new Date(ms);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function Chip({ text, on, onClick }: { text: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="schedule-chip"
      data-on={on || undefined}
      aria-pressed={on}
      onClick={onClick}
    >
      {text}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="schedule-edit__field">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

export function ScheduleEditor({ schedule, onDone }: { schedule: Schedule; onDone: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const rule = schedule.rule;
  const [title, setTitle] = useState(schedule.title);
  const [task, setTask] = useState(schedule.task);
  const [time, setTime] = useState(minuteText(minuteOf(rule)));
  const [day, setDay] = useState(dayInput(rule.kind === "once" ? rule.at : Date.now()));
  const [weekdays, setWeekdays] = useState(rule.kind === "weekly" ? rule.weekdays : [1]);
  const [days, setDays] = useState(rule.kind === "monthly" ? rule.days.join(", ") : "1");
  const [minutes, setMinutes] = useState(rule.kind === "every" ? rule.minutes : 120);
  const [windowed, setWindowed] = useState(rule.kind === "every" && rule.from !== null);
  const [from, setFrom] = useState(
    minuteText(rule.kind === "every" && rule.from !== null ? rule.from : 8 * 60),
  );
  const [to, setTo] = useState(
    minuteText(rule.kind === "every" && rule.to !== null ? rule.to : 22 * 60),
  );
  const [output, setOutput] = useState(schedule.output);
  const [notify, setNotify] = useState(schedule.notify);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const intervals = INTERVALS.includes(minutes) ? INTERVALS : [...INTERVALS, minutes];

  const nextRule = (): ScheduleRule | null => {
    const minute = parseMinute(time);
    switch (rule.kind) {
      case "once": {
        const [year, month, date] = day.split("-").map(Number);
        if (minute === null || !year || !month || !date) return null;
        return { kind: "once", at: new Date(year, month - 1, date).getTime() + minute * 60_000 };
      }
      case "daily":
        return minute === null ? null : { kind: "daily", minute };
      case "weekly":
        return minute === null || weekdays.length === 0
          ? null
          : { kind: "weekly", weekdays: [...weekdays].sort(), minute };
      case "monthly": {
        const picked = days
          .split(/[^\d]+/)
          .map(Number)
          .filter((value) => value >= 1 && value <= 31);
        return minute === null || picked.length === 0
          ? null
          : { kind: "monthly", days: [...new Set(picked)].sort((a, b) => a - b), minute };
      }
      case "every": {
        if (!windowed) return { kind: "every", minutes, from: null, to: null };
        const start = parseMinute(from);
        const end = parseMinute(to);
        return start === null || end === null
          ? null
          : { kind: "every", minutes, from: start, to: end };
      }
    }
  };

  const save = async () => {
    const next = nextRule();
    if (!next || !title.trim() || !task.trim()) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    try {
      await store.updateSchedule({
        ...schedule,
        title: title.trim(),
        task: task.trim(),
        rule: next,
        output,
        notify,
      });
      onDone();
    } catch {
      setInvalid(true);
    } finally {
      setBusy(false);
    }
  };

  const timeInput = (
    <input
      className="schedule-edit__input schedule-edit__time"
      value={time}
      aria-label={t("schedule-card-when")}
      onChange={(event) => setTime(event.target.value)}
    />
  );

  return (
    <div className="schedule-edit">
      <Field label={t("schedule-edit-name")}>
        <input
          className="schedule-edit__input"
          value={title}
          aria-label={t("schedule-edit-name")}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label={t("schedule-card-task")}>
        <textarea
          className="schedule-edit__input schedule-edit__area"
          value={task}
          aria-label={t("schedule-card-task")}
          onChange={(event) => setTask(event.target.value)}
        />
      </Field>
      {rule.kind === "once" && (
        <Field label={t("schedule-card-when")}>
          <input
            type="date"
            className="schedule-edit__input schedule-edit__time"
            value={day}
            aria-label={t("event-date")}
            onChange={(event) => setDay(event.target.value)}
          />
          {timeInput}
        </Field>
      )}
      {rule.kind === "daily" && <Field label={t("schedule-card-when")}>{timeInput}</Field>}
      {rule.kind === "weekly" && (
        <Field label={t("schedule-card-when")}>
          {SCHEDULE_WEEKDAYS.map((key, index) => {
            const value = index + 1;
            const on = weekdays.includes(value);
            return (
              <Chip
                key={key}
                text={t(key)}
                on={on}
                onClick={() =>
                  setWeekdays(on ? weekdays.filter((item) => item !== value) : [...weekdays, value])
                }
              />
            );
          })}
          {timeInput}
        </Field>
      )}
      {rule.kind === "monthly" && (
        <Field label={t("schedule-edit-days")}>
          <input
            className="schedule-edit__input schedule-edit__time"
            value={days}
            placeholder={t("schedule-edit-days-hint")}
            aria-label={t("schedule-edit-days")}
            onChange={(event) => setDays(event.target.value)}
          />
          {timeInput}
        </Field>
      )}
      {rule.kind === "every" && (
        <>
          <Field label={t("schedule-card-every")}>
            {intervals
              .filter((value) => value >= MIN_EVERY)
              .map((value) => (
                <Chip
                  key={value}
                  text={intervalText(t, value)}
                  on={value === minutes}
                  onClick={() => setMinutes(value)}
                />
              ))}
          </Field>
          <Field label={t("schedule-edit-window")}>
            <Chip
              text={t("schedule-window-all")}
              on={!windowed}
              onClick={() => setWindowed(false)}
            />
            <Chip
              text={t("schedule-rule-window", { from, to })}
              on={windowed}
              onClick={() => setWindowed(true)}
            />
            {windowed && (
              <>
                <input
                  className="schedule-edit__input schedule-edit__time"
                  value={from}
                  aria-label={t("schedule-edit-window")}
                  onChange={(event) => setFrom(event.target.value)}
                />
                <input
                  className="schedule-edit__input schedule-edit__time"
                  value={to}
                  aria-label={t("schedule-edit-window")}
                  onChange={(event) => setTo(event.target.value)}
                />
              </>
            )}
          </Field>
        </>
      )}
      <Field label={t("schedule-card-output")}>
        <Chip
          text={t("schedule-output-new", { title: title.trim() || schedule.title })}
          on={output === "new_thread"}
          onClick={() => setOutput("new_thread")}
        />
        <Chip
          text={t("schedule-output-same")}
          on={output === "same_thread"}
          onClick={() => setOutput("same_thread")}
        />
      </Field>
      <Field label={t("schedule-card-notify")}>
        {NOTIFY_OPTIONS.map((option) => (
          <Chip
            key={option}
            text={notifyText(t, option)}
            on={option === notify}
            onClick={() => setNotify(option)}
          />
        ))}
      </Field>
      {invalid && <p className="schedule-card__invalid">{t("schedule-time-invalid")}</p>}
      <div className="schedule-card__buttons">
        <button
          type="button"
          className="button button--dark"
          disabled={busy}
          onClick={() => void save()}
        >
          {t("schedule-edit-done")}
        </button>
        <button type="button" className="button button--line" onClick={onDone}>
          {t("dialog-cancel")}
        </button>
      </div>
    </div>
  );
}

function Rows({ schedule, onEdit }: { schedule: Schedule; onEdit: (() => void) | undefined }) {
  const { t } = useI18n();
  const every = schedule.rule.kind === "every";
  const rows: [string, string][] = [
    [t(every ? "schedule-card-every" : "schedule-card-when"), ruleText(t, schedule.rule)],
  ];
  if (!every) rows.push([t("schedule-card-task"), schedule.task]);
  if (schedule.stop.kind !== "never") {
    rows.push([t("schedule-card-stop"), stopText(t, schedule.stop)]);
  }
  if (!every) rows.push([t("schedule-card-output"), outputText(t, schedule)]);
  rows.push([t("schedule-card-notify"), notifyText(t, schedule.notify)]);
  return (
    <dl className="schedule-card__rows">
      {rows.map(([label, value]) => (
        <div key={label} className="schedule-card__row">
          <dt>{label}</dt>
          <dd>
            {onEdit ? (
              <button type="button" className="schedule-card__value" onClick={onEdit}>
                {value}
              </button>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ScheduleCard({
  scheduleId,
  onOpenThread,
}: {
  scheduleId: string;
  onOpenThread: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { schedules, status } = useHubState(store);
  const schedule = schedules[scheduleId];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status === "open" && !schedule) void store.loadSchedule(scheduleId).catch(() => undefined);
  }, [status, schedule, store, scheduleId]);

  if (!schedule) return null;
  const draft = schedule.state === "draft";
  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await store.startSchedule(schedule.id);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const target = schedule.threadId;

  return (
    <div className="schedule-card">
      <div className="schedule-card__head">
        <ClockIcon />
        <b>{schedule.title}</b>
      </div>
      {editing ? (
        <ScheduleEditor schedule={schedule} onDone={() => setEditing(false)} />
      ) : (
        <>
          <Rows schedule={schedule} onEdit={draft ? () => setEditing(true) : undefined} />
          {draft ? (
            <>
              <p className="schedule-card__foot">{t("schedule-foot-computer")}</p>
              {failed && <p className="schedule-card__invalid">{t("schedule-start-failed")}</p>}
              <div className="schedule-card__buttons">
                <button
                  type="button"
                  className="button button--dark"
                  disabled={busy}
                  onClick={() => void start()}
                >
                  {t("schedule-start")}
                </button>
                <button
                  type="button"
                  className="button button--line"
                  onClick={() => setEditing(true)}
                >
                  {t("schedule-edit")}
                </button>
              </div>
            </>
          ) : (
            <p className="schedule-card__status">
              {schedule.state === "active" && schedule.nextAt !== null
                ? t("schedule-started", { next: scheduleWhen(t, schedule.nextAt) })
                : stateText(t, schedule)}
              {target && (
                <button
                  type="button"
                  className="schedule-card__link"
                  onClick={() => onOpenThread(target)}
                >
                  {t("schedule-open")}
                </button>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function ScheduleBar({ schedule }: { schedule: Schedule }) {
  const { t } = useI18n();
  const store = useHub();
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const paused = schedule.state === "paused";
  const live = schedule.state === "active" || paused;
  const act = (action: Promise<unknown>) => {
    setFailed(false);
    void action.catch(() => setFailed(true));
  };
  return (
    <div className="schedule-bar">
      <div className="schedule-bar__row">
        <ClockIcon />
        <button
          type="button"
          className="schedule-bar__text"
          aria-expanded={editing}
          onClick={() => setEditing((open) => !open)}
        >
          <b>{`${ruleText(t, schedule.rule)}${t("schedule-dot")}${stateText(t, schedule)}`}</b>
          <span>{runsText(t, schedule)}</span>
        </button>
        <button
          type="button"
          className="schedule-bar__link"
          onClick={() => act(store.runSchedule(schedule.id))}
        >
          {t("schedule-run-now")}
        </button>
        {live && (
          <button
            type="button"
            className="schedule-bar__muted"
            onClick={() => act(store.setScheduleActive(schedule.id, paused))}
          >
            {t(paused ? "schedule-resume" : "schedule-pause")}
          </button>
        )}
      </div>
      {failed && <p className="schedule-card__invalid">{t("schedule-start-failed")}</p>}
      {editing && <ScheduleEditor schedule={schedule} onDone={() => setEditing(false)} />}
    </div>
  );
}

export function RunMarker({
  mark,
  dueAt,
  failed,
}: {
  mark: RunMark;
  dueAt: number;
  failed: boolean;
}) {
  const { t } = useI18n();
  return (
    <li className="schedule-marker">
      <span>{markText(t, mark, dueAt, failed)}</span>
    </li>
  );
}

export function FailedCard({ scheduleId, reason }: { scheduleId: string; reason: string }) {
  const { t } = useI18n();
  const store = useHub();
  const { schedules } = useHubState(store);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await store.runSchedule(scheduleId);
      setClosed(true);
    } catch {
      setClosed(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="schedule-failed">
      <b>{t("schedule-failed-title")}</b>
      <p>{failedText(t, reason, schedules[scheduleId])}</p>
      {!closed && (
        <div className="schedule-card__buttons">
          <button
            type="button"
            className="button button--dark"
            disabled={busy}
            onClick={() => void retry()}
          >
            {t("schedule-retry")}
          </button>
          <button type="button" className="button button--line" onClick={() => setClosed(true)}>
            {t("schedule-skip")}
          </button>
        </div>
      )}
    </div>
  );
}
