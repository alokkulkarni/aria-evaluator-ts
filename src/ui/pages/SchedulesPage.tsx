// src/ui/pages/SchedulesPage.tsx
// UI for managing scheduled and continuous evaluation runs

import React, { useState, useEffect } from 'react';
import { apiFetch, toApiUrl } from '../lib/api.js';
import { NavSchedulesIcon, RunFailIcon, RunRunningIcon } from '../components/icons.js';

interface Schedule {
  id: string;
  name: string;
  description?: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  hour: number;
  minute: number;
  dayOfWeek?: number;
  timezone: string;
  status: 'active' | 'paused' | 'archived';
  lastRunAt?: string;
  nextRunAt: string;
  lastStatus?: string;
  failureCount: number;
  maxFailures: number;
  createdAt: string;
}

interface ScheduleRun {
  id: string;
  scheduleId: string;
  runId: string;
  triggeredAt: string;
  status: 'queued' | 'completed' | 'failed';
  completedAt?: string;
  errorMessage?: string;
}

const FREQUENCIES: Array<'hourly' | 'daily' | 'weekly' | 'monthly'> = ['hourly', 'daily', 'weekly', 'monthly'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getStatusBadgeColor(status: string): string {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'paused') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-800';
}

function getRunStatusBadgeColor(status: string): string {
  if (status === 'completed') return 'bg-green-100 text-green-800';
  if (status === 'failed') return 'bg-red-100 text-red-800';
  return 'bg-blue-100 text-blue-800';
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function formatFrequency(frequency: string, hour: number, minute: number, dayOfWeek?: number): string {
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (frequency === 'hourly') return `Every hour at :${String(minute).padStart(2, '0')}`;
  if (frequency === 'daily') return `Daily at ${time}`;
  if (frequency === 'weekly') return `Weekly on ${DAYS[dayOfWeek ?? 0]} at ${time}`;
  return `Monthly at ${time}`;
}

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRun[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    frequency: 'daily' as const,
    hour: 9,
    minute: 0,
    dayOfWeek: 0,
    timezone: 'America/New_York',
    scenarioId: '',
    provider: 'connect',
    channel: 'chat' as const,
  });

  const loadSchedules = async () => {
    try {
      const data = await apiFetch('/api/schedules') as any;
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading schedules:', err);
    }
    setLoading(false);
  };

  const loadScheduleRuns = async (scheduleId: string) => {
    try {
      const data = await apiFetch(`/api/schedules/${scheduleId}`) as any;
      setScheduleRuns(data.scheduleRuns || []);
    } catch (err) {
      console.error('Error loading schedule runs:', err);
    }
  };

  const createSchedule = async () => {
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setShowCreateForm(false);
      setFormData({
        name: '',
        description: '',
        frequency: 'daily',
        hour: 9,
        minute: 0,
        dayOfWeek: 0,
        timezone: 'America/New_York',
        scenarioId: '',
        provider: 'connect',
        channel: 'chat',
      });
      await loadSchedules();
    } catch (err) {
      console.error('Error creating schedule:', err);
      alert(`Error creating schedule: ${(err as Error).message}`);
    }
  };

  const pauseSchedule = async (id: string) => {
    try {
      await apiFetch(`/api/schedules/${id}/pause`, { method: 'POST' });
      await loadSchedules();
    } catch (err) {
      console.error('Error pausing schedule:', err);
    }
  };

  const resumeSchedule = async (id: string) => {
    try {
      await apiFetch(`/api/schedules/${id}/resume`, { method: 'POST' });
      await loadSchedules();
    } catch (err) {
      console.error('Error resuming schedule:', err);
    }
  };

  const triggerNow = async (id: string) => {
    try {
      const data = await apiFetch(`/api/schedules/${id}/trigger-now`, { method: 'POST' }) as any;
      alert(`Run triggered: ${data.runId}`);
      await loadScheduleRuns(id);
    } catch (err) {
      console.error('Error triggering schedule:', err);
      alert(`Error triggering schedule: ${(err as Error).message}`);
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await apiFetch(`/api/schedules/${id}`, { method: 'DELETE' });
      await loadSchedules();
      setSelectedSchedule(null);
    } catch (err) {
      console.error('Error deleting schedule:', err);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  useEffect(() => {
    if (selectedSchedule) {
      loadScheduleRuns(selectedSchedule.id);
    }
  }, [selectedSchedule]);

  if (loading) {
    return <div className="p-4">Loading schedules...</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-4">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Automation</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Schedules</h1>
          <p className="text-sm leading-6 text-slate-200/80">Manage recurring evaluation runs and watch upcoming activity.</p>
        </div>
      </section>

      <div className="flex justify-between items-center gap-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <NavSchedulesIcon className="h-5 w-5 text-slate-500" aria-hidden="true" />
          Schedules
        </h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="btn-primary px-4 py-2"
        >
          {showCreateForm ? 'Cancel' : '+ New Schedule'}
        </button>
      </div>

      {showCreateForm && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Create New Schedule</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input
              type="text"
              placeholder="Schedule name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="h-11"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="h-11"
            />
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
              className="h-11"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                max="23"
                placeholder="Hour"
                value={formData.hour}
                onChange={(e) => setFormData({ ...formData, hour: parseInt(e.target.value, 10) })}
                className="h-11 w-24"
              />
              <input
                type="number"
                min="0"
                max="59"
                placeholder="Minute"
                value={formData.minute}
                onChange={(e) => setFormData({ ...formData, minute: parseInt(e.target.value, 10) })}
                className="h-11 w-24"
              />
            </div>
            {formData.frequency === 'weekly' && (
              <select
                value={formData.dayOfWeek}
                onChange={(e) => setFormData({ ...formData, dayOfWeek: parseInt(e.target.value, 10) })}
                className="h-11"
              >
                {DAYS.map((day, idx) => (
                  <option key={idx} value={idx}>
                    {day}
                  </option>
                ))}
              </select>
            )}
            <select
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="h-11"
            >
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
            <select
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              className="h-11"
            >
              <option value="connect">Connect</option>
              <option value="lex">Lex</option>
              <option value="azure">Azure</option>
              <option value="custom">Custom</option>
            </select>
            <select
              value={formData.channel}
              onChange={(e) => setFormData({ ...formData, channel: e.target.value as any })}
              className="border rounded px-3 py-2"
            >
              <option value="chat">Chat</option>
              <option value="voice">Voice</option>
            </select>
          </div>
          <button
            onClick={createSchedule}
            className="btn-primary w-full justify-center"
          >
            Create Schedule
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Schedules List */}
        <div className="card lg:col-span-2 p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Schedules ({schedules.length})</h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {schedules.length === 0 ? (
              <div className="p-4 text-slate-500">No schedules yet</div>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  onClick={() => setSelectedSchedule(schedule)}
                  className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                    selectedSchedule?.id === schedule.id ? 'bg-blue-50/70 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold">{schedule.name}</h3>
                      <p className="text-sm text-slate-600">{schedule.description || 'No description'}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatFrequency(schedule.frequency, schedule.hour, schedule.minute, schedule.dayOfWeek)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Next: {formatDateTime(schedule.nextRunAt)}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getStatusBadgeColor(schedule.status)}`}>
                      {schedule.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Schedule Details and Recent Runs */}
        <div className="card p-0 overflow-hidden">
          {selectedSchedule ? (
            <>
              <div className="p-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">Details</h2>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-600">Status</p>
                  <p className="font-semibold">{selectedSchedule.status}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Last Run</p>
                  <p className="font-semibold text-sm">
                    {selectedSchedule.lastRunAt ? formatDateTime(selectedSchedule.lastRunAt) : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Failures</p>
                  <p className="font-semibold">
                    {selectedSchedule.failureCount} / {selectedSchedule.maxFailures}
                  </p>
                </div>
                <div className="pt-3 space-y-2">
                  <button
                    onClick={() => triggerNow(selectedSchedule.id)}
                    className="btn-primary w-full justify-center"
                  >
                    <span className="flex items-center gap-1.5">
                      <RunRunningIcon className="h-4 w-4" aria-hidden="true" />
                      Run Now
                    </span>
                  </button>
                  {selectedSchedule.status === 'active' ? (
                    <button
                      onClick={() => pauseSchedule(selectedSchedule.id)}
                      className="btn-secondary w-full justify-center"
                    >
                      <span className="flex items-center gap-1.5">
                        <RunFailIcon className="h-4 w-4" aria-hidden="true" />
                        Pause
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => resumeSchedule(selectedSchedule.id)}
                      className="btn-primary w-full justify-center"
                    >
                      <span className="flex items-center gap-1.5">
                        <RunRunningIcon className="h-4 w-4" aria-hidden="true" />
                        Resume
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => deleteSchedule(selectedSchedule.id)}
                    className="btn-danger w-full justify-center"
                  >
                    <span className="flex items-center gap-1.5">
                      <RunFailIcon className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </span>
                  </button>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-2 text-slate-900">Recent Runs ({scheduleRuns.length})</h3>
                  <div className="space-y-1 max-h-32 overflow-y-auto text-xs">
                    {scheduleRuns.length === 0 ? (
                      <p className="text-slate-500">No runs yet</p>
                    ) : (
                      scheduleRuns.map((run) => (
                        <div key={run.id} className="flex items-center justify-between">
                          <span>
                            <span className={`px-1.5 py-0.5 rounded ${getRunStatusBadgeColor(run.status)}`}>
                              {run.status}
                            </span>
                          </span>
                          <span className="text-slate-600">{new Date(run.triggeredAt).toLocaleTimeString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-slate-500">Select a schedule to see details</div>
          )}
        </div>
      </div>
    </div>
  );
}
