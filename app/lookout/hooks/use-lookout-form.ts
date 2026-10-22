'use client';

import React from 'react';
import { sileo } from 'sileo';
import type { CreateLookoutParams, Lookout, UpdateLookoutParams } from '@/hooks/use-lookouts';
import { allExampleLookouts, DEFAULT_FORM_VALUES, frequencyOptions } from '../constants';
import { clockReading, isTimeInPast } from '../utils/time-utils';

type LookoutExample = (typeof allExampleLookouts)[number];

type SubmitCallbacks = { onSuccess?: () => void };

export interface LookoutFormHookReturn {
  // Form state
  selectedFrequency: string;
  selectedTime: string;
  selectedTimezone: string;
  selectedDate: Date | undefined;
  selectedDayOfWeek: string;
  selectedSearchMode: string;
  selectedExample: LookoutExample | null;
  isCreateDialogOpen: boolean;
  editingLookout: Lookout | null;

  // Form actions
  setSelectedFrequency: (frequency: string) => void;
  setSelectedTime: (time: string) => void;
  setSelectedTimezone: (timezone: string) => void;
  setSelectedDate: (date: Date | undefined) => void;
  setSelectedDayOfWeek: (day: string) => void;
  setSelectedSearchMode: (mode: string) => void;

  // Form handlers
  handleDialogOpenChange: (open: boolean) => void;
  handleUseExample: (example: LookoutExample) => void;
  populateFormForEdit: (lookout: Lookout) => void;

  // Form submission
  createLookoutFromForm: (
    formData: FormData,
    createLookout: (params: CreateLookoutParams & SubmitCallbacks) => void,
  ) => void;
  updateLookoutFromForm: (
    formData: FormData,
    updateLookout: (params: UpdateLookoutParams & SubmitCallbacks) => void,
  ) => void;
}

// The form's fields, checked; null (after a toast saying why) when they don't hold up.
function readForm(formData: FormData): (CreateLookoutParams & { timezone: string }) | null {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  const title = field('title').trim();
  const prompt = field('prompt').trim();
  const frequency = frequencyOptions.find((option) => option.value === field('frequency'))?.value;
  const time = field('time');
  const timezone = field('timezone') || DEFAULT_FORM_VALUES.TIMEZONE;
  const date = field('date');
  const dayOfWeek = field('dayOfWeek');

  if (!title || !prompt || !frequency) {
    sileo.error({ title: 'Please fill in all required fields' });
    return null;
  }
  if (frequency === 'once') {
    if (!date) {
      sileo.error({ title: 'Please select a date for one-time lookouts' });
      return null;
    }
    if (!time) {
      sileo.error({ title: 'Please select a time' });
      return null;
    }
    if (isTimeInPast(date, time, timezone)) {
      sileo.error({ title: 'Cannot schedule lookout in the past' });
      return null;
    }
  }

  return {
    title,
    prompt,
    frequency,
    // A weekly lookout's day travels in its time: "HH:MM:D".
    time: frequency === 'weekly' && dayOfWeek ? `${time}:${dayOfWeek}` : time,
    timezone,
    date: frequency === 'once' ? date : undefined,
    searchMode: field('searchMode') || DEFAULT_FORM_VALUES.SEARCH_MODE,
  };
}

export function useLookoutForm(detectedTimezone: string = DEFAULT_FORM_VALUES.TIMEZONE): LookoutFormHookReturn {
  // Form state
  const [selectedFrequency, setSelectedFrequency] = React.useState<string>(DEFAULT_FORM_VALUES.FREQUENCY);
  const [selectedTime, setSelectedTime] = React.useState<string>(DEFAULT_FORM_VALUES.TIME);
  const [selectedTimezone, setSelectedTimezone] = React.useState<string>(detectedTimezone);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>();
  const [selectedDayOfWeek, setSelectedDayOfWeek] = React.useState<string>(DEFAULT_FORM_VALUES.DAY_OF_WEEK);
  const [selectedSearchMode, setSelectedSearchMode] = React.useState<string>(DEFAULT_FORM_VALUES.SEARCH_MODE);
  const [selectedExample, setSelectedExample] = React.useState<LookoutExample | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [editingLookout, setEditingLookout] = React.useState<Lookout | null>(null);

  // Reset form to default values
  const resetForm = React.useCallback(() => {
    setSelectedFrequency(DEFAULT_FORM_VALUES.FREQUENCY);
    setSelectedTime(DEFAULT_FORM_VALUES.TIME);
    setSelectedTimezone(detectedTimezone);
    setSelectedDate(undefined);
    setSelectedDayOfWeek(DEFAULT_FORM_VALUES.DAY_OF_WEEK);
    setSelectedSearchMode(DEFAULT_FORM_VALUES.SEARCH_MODE);
    setSelectedExample(null);
    setEditingLookout(null);
  }, [detectedTimezone]);

  // Handle dialog open/close with form reset
  const handleDialogOpenChange = React.useCallback(
    (open: boolean) => {
      setIsCreateDialogOpen(open);
      if (open && !editingLookout) {
        // Use detected timezone when opening dialog for new lookout
        setSelectedTimezone(detectedTimezone);
      } else if (!open) {
        resetForm();
      }
    },
    [resetForm, editingLookout, detectedTimezone],
  );

  const handleUseExample = React.useCallback((example: LookoutExample) => {
    setSelectedExample(example);
    setSelectedFrequency(example.frequency);
    setSelectedTime(example.time);
    setSelectedTimezone(example.timezone);
    setSelectedDayOfWeek(example.dayOfWeek ?? DEFAULT_FORM_VALUES.DAY_OF_WEEK);
    setSelectedSearchMode(example.searchMode);
    setIsCreateDialogOpen(true);
  }, []);

  const populateFormForEdit = React.useCallback((lookout: Lookout) => {
    setEditingLookout(lookout);
    setSelectedFrequency(lookout.frequency);
    setSelectedTimezone(lookout.timezone);
    setSelectedSearchMode(lookout.searchMode || DEFAULT_FORM_VALUES.SEARCH_MODE);

    if (lookout.cronSchedule) {
      // "CRON_TZ=<timezone> <minutes> <hours> <day> <month> <weekday>"
      const parts = lookout.cronSchedule.split(' ');
      const cronParts = parts[0]?.startsWith('CRON_TZ=') ? parts.slice(1) : parts;
      if (cronParts.length >= 2) {
        setSelectedTime(`${cronParts[1].padStart(2, '0')}:${cronParts[0].padStart(2, '0')}`);
      }
      if (lookout.frequency === 'weekly' && cronParts.length >= 5) {
        setSelectedDayOfWeek(cronParts[4]);
      }
    } else if (lookout.frequency === 'once') {
      // A one-time lookout has no cron: its date and time are the run's, read
      // on the lookout's own clock.
      const { date, time } = clockReading(lookout.timezone, lookout.nextRunAt);
      const [year, month, day] = date.split('-').map(Number);
      setSelectedDate(new Date(year, month - 1, day));
      setSelectedTime(time);
    }

    setIsCreateDialogOpen(true);
  }, []);

  const createLookoutFromForm = React.useCallback<LookoutFormHookReturn['createLookoutFromForm']>(
    (formData, createLookout) => {
      const fields = readForm(formData);
      if (!fields) return;
      createLookout({ ...fields, onSuccess: () => handleDialogOpenChange(false) });
    },
    [handleDialogOpenChange],
  );

  const updateLookoutFromForm = React.useCallback<LookoutFormHookReturn['updateLookoutFromForm']>(
    (formData, updateLookout) => {
      if (!editingLookout) return;
      const fields = readForm(formData);
      if (!fields) return;
      updateLookout({ ...fields, id: editingLookout.id, onSuccess: () => handleDialogOpenChange(false) });
    },
    [editingLookout, handleDialogOpenChange],
  );

  return {
    // State
    selectedFrequency,
    selectedTime,
    selectedTimezone,
    selectedDate,
    selectedDayOfWeek,
    selectedSearchMode,
    selectedExample,
    isCreateDialogOpen,
    editingLookout,

    // Setters
    setSelectedFrequency,
    setSelectedTime,
    setSelectedTimezone,
    setSelectedDate,
    setSelectedDayOfWeek,
    setSelectedSearchMode,

    // Handlers
    handleDialogOpenChange,
    handleUseExample,
    populateFormForEdit,

    // Form submission
    createLookoutFromForm,
    updateLookoutFromForm,
  };
}
