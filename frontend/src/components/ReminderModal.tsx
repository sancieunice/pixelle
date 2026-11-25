import React, { useState, useEffect } from 'react';
import { X, Calendar, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { Character, Reminder } from '../types';
import * as api from '../services/api';

interface ReminderModalProps {
  character: Character;
  onClose: () => void;
  onReminderTriggered?: (msg: string) => void;
}

export const ReminderModal: React.FC<ReminderModalProps> = ({
  character,
  onClose,
  onReminderTriggered
}) => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchReminders = async () => {
    try {
      const data = await api.getReminders(character.id);
      setReminders(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchReminders();
    // Default scheduled time to 15 mins from now
    const now = new Date(Date.now() + 15 * 60 * 1000);
    setScheduledAt(now.toISOString().slice(0, 16));
  }, [character.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim() || !scheduledAt) return;
    setIsSubmitting(true);
    try {
      await api.createReminder({
        character_id: character.id,
        title: title.trim(),
        message: message.trim(),
        scheduled_at: scheduledAt
      });
      setTitle('');
      setMessage('');
      await fetchReminders();
    } catch (err: any) {
      alert(err.message || 'Failed to create reminder');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'pending' | 'delivered' | 'dismissed') => {
    try {
      await api.updateReminder(id, { status });
      await fetchReminders();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteReminder(id);
      await fetchReminders();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1020]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#151D32] border border-[#252F49] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-[#252F49] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-[#F4F2FA] text-lg">Reminders for {character.name}</h3>
              <p className="text-[#9BA8C2] text-xs">When due, {character.name} will speak this message!</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#9BA8C2] hover:text-[#F4F2FA] rounded-xl hover:bg-[#0F1528] transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Create Form */}
          <form onSubmit={handleCreate} className="bg-[#0F1528] p-4 rounded-2xl border border-[#252F49] space-y-3">
            <h4 className="text-xs font-semibold text-[#D8B4FE] uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Plus className="w-3.5 h-3.5 text-[#A78BFA]" />
              Schedule New Reminder
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#9BA8C2] mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Drink Water"
                  required
                  className="w-full bg-[#151D32] border border-[#252F49] rounded-xl px-3 py-2 text-xs text-[#F4F2FA] placeholder-[#6C7A9C] focus:outline-none focus:border-[#A78BFA]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#9BA8C2] mb-1">Trigger Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                  className="w-full bg-[#151D32] border border-[#252F49] rounded-xl px-3 py-2 text-xs text-[#F4F2FA] focus:outline-none focus:border-[#A78BFA]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#9BA8C2] mb-1">Speech Message</label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Hey! Take a 5-minute break and hydrate!"
                required
                maxLength={100}
                className="w-full bg-[#151D32] border border-[#252F49] rounded-xl px-3 py-2 text-xs text-[#F4F2FA] placeholder-[#6C7A9C] focus:outline-none focus:border-[#A78BFA]"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-[#A78BFA] hover:bg-[#9066F7] text-[#0B1020] rounded-xl text-xs font-heading font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Scheduling...' : 'Set Reminder'}
            </button>
          </form>

          {/* List of Scheduled Reminders */}
          <div>
            <h4 className="text-xs font-semibold text-[#9BA8C2] uppercase tracking-wider mb-3 font-mono">
              Scheduled Reminders ({reminders.length})
            </h4>

            {reminders.length === 0 ? (
              <p className="text-[#9BA8C2]/60 text-xs italic text-center py-4">
                No reminders scheduled yet. Add one above!
              </p>
            ) : (
              <div className="space-y-2">
                {reminders.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 bg-[#0F1528] border border-[#252F49] rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#F4F2FA] text-xs truncate">{r.title}</span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-mono uppercase ${
                            r.status === 'delivered'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-[#A78BFA]/15 text-[#D8B4FE] border border-[#A78BFA]/30'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="text-[#9BA8C2] text-xs truncate mt-0.5">"{r.message}"</p>
                      <p className="text-[10px] text-[#9BA8C2]/60 font-mono mt-0.5">
                        Due: {new Date(r.scheduled_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onReminderTriggered && (
                        <button
                          type="button"
                          onClick={() => {
                            onReminderTriggered(r.message);
                            onClose();
                          }}
                          title="Test trigger this reminder now"
                          className="px-2.5 py-1 bg-[#A78BFA]/15 hover:bg-[#A78BFA]/25 text-[#D8B4FE] text-[10px] font-semibold rounded-lg transition-all cursor-pointer border border-[#A78BFA]/30"
                        >
                          Test Now
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStatusChange(r.id, r.status === 'delivered' ? 'pending' : 'delivered')}
                        title="Toggle status"
                        className="p-1.5 text-[#9BA8C2] hover:text-[#A78BFA] rounded-lg cursor-pointer transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        title="Delete reminder"
                        className="p-1.5 text-[#9BA8C2] hover:text-red-400 rounded-lg cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
