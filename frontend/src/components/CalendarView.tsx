import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, CheckCircle2, AlertCircle, KeyRound, Sparkles, Bell, UserCheck } from 'lucide-react';
import * as api from '../services/api';
import { Character } from '../types';

interface CalendarViewProps {
  activeCompanion: Character | null;
  onRefreshReminders?: () => void;
  onOpenReminders?: (char: Character) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  activeCompanion,
  onRefreshReminders,
  onOpenReminders
}) => {
  const [status, setStatus] = useState<any>(null);
  const [calendarIdInput, setCalendarIdInput] = useState<string>('primary');
  const [isLoading, setIsLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const statusData = await api.getCalendarStatus();
      setStatus(statusData);
      if (statusData.calendar_id) {
        setCalendarIdInput(statusData.calendar_id);
      }
    } catch (err) {
      console.error('Failed to load calendar data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncReminders = async () => {
    setIsLoading(true);
    try {
      const res = await api.syncCalendarReminders(activeCompanion?.id);
      setSyncMessage(`Successfully synced ${res.synced_count} event(s) to ${activeCompanion?.name || 'companion'}!`);
      if (onRefreshReminders) onRefreshReminders();
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Sync failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCalendarId = async () => {
    try {
      await fetch(`/api/calendar/calendar-id?calendar_id=${encodeURIComponent(calendarIdInput)}`, { method: 'POST' });
      alert('Calendar ID saved!');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const saEmail = status?.service_account_info?.client_email || 'pixelle@pixelle-515617.iam.gserviceaccount.com';

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#151D32] border border-[#252F49] rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="font-heading text-2xl font-bold text-[#F4F2FA] flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-[#A78BFA]" />
            Google Calendar Sync
          </h2>
          <p className="text-[#9BA8C2] text-sm mt-1">
            Connect your calendar so your active companion announces upcoming events directly on your desktop.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="px-4 py-2.5 bg-[#0F1528] hover:bg-[#1A243F] text-[#F4F2FA] rounded-xl border border-[#252F49] text-sm font-medium flex items-center gap-2 transition-all self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-[#A78BFA] ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {syncMessage && (
        <div className="p-4 bg-[#A78BFA]/10 border border-[#A78BFA]/30 rounded-2xl flex items-center gap-3 text-xs text-[#D8B4FE]">
          <CheckCircle2 className="w-4 h-4 text-[#A78BFA] shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Alert Banner if Service Account Key Issue is detected */}
      {status?.error_reason && (
        <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row gap-3.5">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-2">
            <p className="font-semibold text-amber-300">
              Google Calendar is not connected.
            </p>
            <p className="text-[#9BA8C2]">{status.error_reason}</p>
            <div className="bg-[#0F1528] p-3.5 rounded-xl border border-amber-500/20 text-[#9BA8C2] space-y-1.5 font-sans">
              <p className="font-bold text-[#F4F2FA]">To connect:</p>
              {status?.credentials_type === 'service_account' ? (
                <p>
                  Share the selected calendar with <code className="text-amber-300 font-mono select-all">{saEmail}</code> and grant permission to see all event details.
                </p>
              ) : (
                <p>Authorize your Google account from the calendar connection flow, then refresh this page.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Card 1: Connection Status & Calendar ID */}
        <div className="bg-[#151D32] border border-[#252F49] rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-[#9BA8C2] uppercase tracking-wider flex items-center gap-2 font-mono">
                <KeyRound className="w-4 h-4 text-[#A78BFA]" />
                Connection Details
              </span>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider ${
                  status?.is_connected
                    ? 'bg-[#A78BFA]/15 text-[#D8B4FE] border border-[#A78BFA]/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}
              >
                {status?.is_connected ? 'Live Google Calendar' : status ? 'Not connected' : 'Checking...'}
              </span>
            </div>

            <div className="bg-[#0F1528] p-3.5 rounded-xl border border-[#252F49] text-xs space-y-2 mb-4">
              <div className="flex justify-between text-[#9BA8C2]">
                <span>Account Type:</span>
                <span className="font-mono text-[#F4F2FA] capitalize">{status?.credentials_type || 'Unknown'}</span>
              </div>
              <div className="flex justify-between text-[#9BA8C2]">
                <span>Credentials:</span>
                <span className="font-mono text-[#A78BFA] truncate max-w-[170px]">{status?.credentials_path || 'None'}</span>
              </div>
              {status?.service_account_info?.client_email && (
                <div className="flex flex-col gap-1 pt-1.5 border-t border-[#252F49] text-[#9BA8C2]">
                  <span>Service Account:</span>
                  <span className="font-mono text-[11px] text-amber-300 truncate select-all">{status.service_account_info.client_email}</span>
                </div>
              )}
            </div>

            {/* Calendar ID Config */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#9BA8C2] uppercase font-mono">
                Target Google Calendar ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={calendarIdInput}
                  onChange={(e) => setCalendarIdInput(e.target.value)}
                  placeholder="e.g. yourname@gmail.com"
                  className="flex-1 bg-[#0F1528] border border-[#252F49] rounded-xl px-3.5 py-2 text-xs text-[#F4F2FA] placeholder-[#6C7A9C] focus:outline-none focus:border-[#A78BFA]"
                />
                <button
                  type="button"
                  onClick={handleSaveCalendarId}
                  className="px-4 py-2 bg-[#0F1528] hover:bg-[#1A243F] text-[#F4F2FA] text-xs font-medium rounded-xl border border-[#252F49] cursor-pointer transition-all"
                >
                  Save
                </button>
              </div>
              <p className="text-[11px] text-[#9BA8C2]/60">
                Use your primary Gmail address or the ID of the calendar you shared.
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Active Companion & Sync Controls */}
        <div className="bg-[#151D32] border border-[#252F49] rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-[#9BA8C2] uppercase tracking-wider flex items-center gap-2 font-mono">
                <UserCheck className="w-4 h-4 text-[#A78BFA]" />
                Active Companion
              </span>
              {activeCompanion && (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider bg-[#A78BFA]/15 text-[#D8B4FE] border border-[#A78BFA]/30">
                  Ready
                </span>
              )}
            </div>

            {activeCompanion ? (
              <div className="p-3.5 bg-[#0F1528] rounded-xl border border-[#252F49] flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={activeCompanion.sprite_scaled_url}
                    alt={activeCompanion.name}
                    className="w-12 h-12 pixel-crisp"
                  />
                  <div>
                    <h4 className="font-heading text-[#F4F2FA] font-bold text-sm">{activeCompanion.name}</h4>
                    <p className="text-[11px] text-[#9BA8C2]">Desktop Companion</p>
                  </div>
                </div>

                {onOpenReminders && (
                  <button
                    type="button"
                    onClick={() => onOpenReminders(activeCompanion)}
                    className="px-3 py-1.5 bg-[#151D32] hover:bg-[#1A243F] text-[#D8B4FE] rounded-xl text-xs flex items-center gap-1.5 border border-[#252F49] transition-all cursor-pointer font-medium"
                  >
                    <Bell className="w-3.5 h-3.5 text-[#A78BFA]" />
                    Reminders
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 bg-[#0F1528] rounded-xl border border-[#252F49] mb-4 text-center">
                <p className="text-[#9BA8C2] text-xs">
                  No active companion chosen yet. Select one in the Companions tab.
                </p>
              </div>
            )}

            <div className="text-xs text-[#9BA8C2] space-y-1.5 mb-2 font-sans">
              <p className="flex items-center gap-1.5 text-[#F4F2FA] font-medium font-heading">
                <Bell className="w-3.5 h-3.5 text-[#A78BFA]" />
                Event Reminders Schedule:
              </p>
              <ul className="text-[11px] text-[#9BA8C2] list-disc list-inside space-y-1 pl-1">
                <li>Events announce 15 min prior to meeting start</li>
                <li>Reminder repeats every 2 min until start</li>
                <li>Double-click desktop pet anytime to pop the next event</li>
              </ul>
            </div>
          </div>

          <div className="pt-4 border-t border-[#252F49]">
            <button
              type="button"
              onClick={handleSyncReminders}
              disabled={isLoading || !activeCompanion}
              className="w-full py-3 bg-[#A78BFA] hover:bg-[#9066F7] disabled:opacity-50 text-[#0B1020] font-heading font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Sync Events to Companion Reminders
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
