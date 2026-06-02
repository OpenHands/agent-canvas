import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import { useUpdateAutomation } from "#/hooks/query/use-automations";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { modalTitleLgMediumClassName } from "#/utils/modal-classes";
import {
  parseCronSchedule,
  buildCronSchedule,
  formatTimeOfDay,
  parseTimeOfDay,
  type SchedulePresetKind,
} from "#/utils/automation-schedule";
import { cn } from "#/utils/utils";
import {
  formControlMultilineFieldClassName,
  formControlSettingsFieldClassName,
} from "#/utils/form-control-classes";
import XMarkIcon from "#/icons/x-mark.svg?react";

interface EditAutomationModalProps {
  automation: Automation;
  isOpen: boolean;
  onClose: () => void;
}

type FrequencyKey = SchedulePresetKind | "custom";

const WEEKDAY_KEYS: I18nKey[] = [
  I18nKey.AUTOMATIONS$WEEKDAY_SUN,
  I18nKey.AUTOMATIONS$WEEKDAY_MON,
  I18nKey.AUTOMATIONS$WEEKDAY_TUE,
  I18nKey.AUTOMATIONS$WEEKDAY_WED,
  I18nKey.AUTOMATIONS$WEEKDAY_THU,
  I18nKey.AUTOMATIONS$WEEKDAY_FRI,
  I18nKey.AUTOMATIONS$WEEKDAY_SAT,
];

interface FormState {
  name: string;
  prompt: string;
  frequency: FrequencyKey;
  weekday: number;
  timeOfDay: string;
  isCustomSchedule: boolean;
  rawSchedule: string;
}

function buildInitialState(automation: Automation): FormState {
  const parsed = parseCronSchedule(automation.trigger.schedule);
  if (parsed.kind === "custom") {
    return {
      name: automation.name,
      prompt: automation.prompt ?? "",
      frequency: "custom",
      weekday: 1,
      timeOfDay:
        parsed.hour !== undefined && parsed.minute !== undefined
          ? formatTimeOfDay(parsed.hour, parsed.minute)
          : "",
      isCustomSchedule: true,
      rawSchedule: parsed.raw,
    };
  }
  return {
    name: automation.name,
    prompt: automation.prompt ?? "",
    frequency: parsed.kind,
    weekday: parsed.kind === "weekly" ? (parsed.weekday ?? 1) : 1,
    timeOfDay: formatTimeOfDay(parsed.hour, parsed.minute),
    isCustomSchedule: false,
    rawSchedule: automation.trigger.schedule ?? "",
  };
}

export function EditAutomationModal({
  automation,
  isOpen,
  onClose,
}: EditAutomationModalProps) {
  const { t } = useTranslation("openhands");
  const updateMutation = useUpdateAutomation();

  const initial = useMemo(() => buildInitialState(automation), [automation]);
  const [form, setForm] = useState<FormState>(initial);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(initial);
      setNameError(null);
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const frequencyItems = [
    {
      key: "daily",
      label: t(I18nKey.AUTOMATIONS$FREQUENCY_DAILY),
    },
    {
      key: "weekdays",
      label: t(I18nKey.AUTOMATIONS$FREQUENCY_WEEKDAYS),
    },
    {
      key: "weekly",
      label: t(I18nKey.AUTOMATIONS$FREQUENCY_WEEKLY),
    },
    ...(form.isCustomSchedule
      ? [
          {
            key: "custom",
            label: t(I18nKey.AUTOMATIONS$FREQUENCY_CUSTOM),
          },
        ]
      : []),
  ];

  const weekdayItems = WEEKDAY_KEYS.map((key, index) => ({
    key: String(index),
    label: t(key),
  }));

  const isTimeEditable =
    !form.isCustomSchedule ||
    parseTimeOfDay(form.timeOfDay) !== null ||
    form.timeOfDay === "";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setNameError(t(I18nKey.AUTOMATIONS$NAME_REQUIRED));
      return;
    }
    setNameError(null);

    const body: Partial<Automation> = {};

    if (trimmedName !== automation.name) {
      body.name = trimmedName;
    }

    const trimmedPrompt = form.prompt.trim();
    const initialPrompt = automation.prompt ?? "";
    if (trimmedPrompt !== initialPrompt.trim()) {
      body.prompt = trimmedPrompt.length === 0 ? null : trimmedPrompt;
    }

    if (!form.isCustomSchedule && form.frequency !== "custom") {
      const parsedTime = parseTimeOfDay(form.timeOfDay);
      if (parsedTime) {
        const newSchedule = buildCronSchedule({
          kind: form.frequency,
          hour: parsedTime.hour,
          minute: parsedTime.minute,
          weekday: form.frequency === "weekly" ? form.weekday : undefined,
        });
        if (newSchedule !== automation.trigger.schedule) {
          body.trigger = {
            ...automation.trigger,
            schedule: newSchedule,
          };
        }
      }
    }

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    updateMutation.mutate(
      { id: automation.id, body },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.AUTOMATIONS$EDIT_SUCCESS));
          onClose();
        },
        onError: (error) => {
          const message = isAxiosError(error)
            ? (error.response?.data as { message?: string } | undefined)
                ?.message ||
              error.message ||
              t(I18nKey.AUTOMATIONS$EDIT_ERROR)
            : (error as Error).message || t(I18nKey.AUTOMATIONS$EDIT_ERROR);
          displayErrorToast(message);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="presentation"
      />
      <div className="relative w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted hover:text-foreground"
          aria-label={t(I18nKey.AUTOMATIONS$CANCEL)}
        >
          <XMarkIcon className="size-5" />
        </button>

        <h2 className={modalTitleLgMediumClassName}>
          {t(I18nKey.AUTOMATIONS$EDIT_TITLE)}
        </h2>

        <form
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-4"
          aria-label={t(I18nKey.AUTOMATIONS$EDIT_TITLE)}
        >
          <SettingsInput
            testId="edit-automation-name"
            name="name"
            type="text"
            label={t(I18nKey.AUTOMATIONS$NAME)}
            value={form.name}
            onChange={(value) => setForm((f) => ({ ...f, name: value }))}
            error={nameError ?? undefined}
            showRequiredTag
          />

          <label className="flex flex-col gap-2.5 w-full min-w-0">
            <span className="text-sm">{t(I18nKey.AUTOMATIONS$PROMPT)}</span>
            <textarea
              data-testid="edit-automation-prompt"
              name="prompt"
              value={form.prompt}
              onChange={(e) =>
                setForm((f) => ({ ...f, prompt: e.target.value }))
              }
              rows={4}
              className={cn(
                formControlMultilineFieldClassName,
                "placeholder:italic",
              )}
            />
            <span className="text-xs text-muted">
              {t(I18nKey.AUTOMATIONS$EDIT_PROMPT_HINT)}
            </span>
          </label>

          <SettingsDropdownInput
            testId="edit-automation-frequency"
            name="frequency"
            label={t(I18nKey.AUTOMATIONS$FREQUENCY)}
            items={frequencyItems}
            selectedKey={form.frequency}
            isDisabled={form.isCustomSchedule}
            onSelectionChange={(key) => {
              if (!key || form.isCustomSchedule) return;
              setForm((f) => ({ ...f, frequency: key as FrequencyKey }));
            }}
          />

          {form.frequency === "weekly" && !form.isCustomSchedule && (
            <SettingsDropdownInput
              testId="edit-automation-weekday"
              name="weekday"
              label={t(I18nKey.AUTOMATIONS$WEEKDAY)}
              items={weekdayItems}
              selectedKey={String(form.weekday)}
              onSelectionChange={(key) => {
                if (key === null) return;
                setForm((f) => ({ ...f, weekday: Number(key) }));
              }}
            />
          )}

          <label className="flex flex-col gap-2.5 w-full min-w-0">
            <span className="text-sm">
              {t(I18nKey.AUTOMATIONS$TIME_OF_DAY)}
            </span>
            <input
              data-testid="edit-automation-time"
              name="timeOfDay"
              type="time"
              value={form.timeOfDay}
              onChange={(e) =>
                setForm((f) => ({ ...f, timeOfDay: e.target.value }))
              }
              disabled={form.isCustomSchedule && !isTimeEditable}
              className={cn(
                formControlSettingsFieldClassName,
                "disabled:bg-[var(--oh-surface-raised)]",
              )}
            />
            {automation.timezone && (
              <span className="text-xs text-muted">
                {t(I18nKey.AUTOMATIONS$TIMEZONE)}: {automation.timezone}
              </span>
            )}
          </label>

          {form.isCustomSchedule && (
            <p
              className="text-xs text-muted"
              data-testid="custom-schedule-hint"
            >
              {t(I18nKey.AUTOMATIONS$CUSTOM_SCHEDULE_HINT)}
              {form.rawSchedule && (
                <>
                  {" "}
                  <code className="text-xs text-content">
                    {form.rawSchedule}
                  </code>
                </>
              )}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <BrandButton
              testId="edit-automation-cancel"
              type="button"
              variant="secondary"
              onClick={onClose}
              isDisabled={updateMutation.isPending}
            >
              {t(I18nKey.AUTOMATIONS$CANCEL)}
            </BrandButton>
            <BrandButton
              testId="edit-automation-save"
              type="submit"
              variant="primary"
              isDisabled={updateMutation.isPending}
              aria-busy={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? t(I18nKey.AUTOMATIONS$SAVING)
                : t(I18nKey.AUTOMATIONS$SAVE)}
            </BrandButton>
          </div>
        </form>
      </div>
    </div>
  );
}
