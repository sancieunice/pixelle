import { Character, GenerateParams, Reminder, BannerSettings } from '../types';

const API_BASE = '/api';

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Backend offline');
  return res.json();
}

export async function generateCharacter(params: GenerateParams): Promise<Character> {
  const res = await fetch(`${API_BASE}/characters/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to generate character');
  }
  return res.json();
}

export async function getCharacters(): Promise<Character[]> {
  const res = await fetch(`${API_BASE}/characters`);
  if (!res.ok) throw new Error('Failed to fetch characters');
  return res.json();
}

export async function getCharacter(id: string): Promise<Character> {
  const res = await fetch(`${API_BASE}/characters/${id}`);
  if (!res.ok) throw new Error('Character not found');
  return res.json();
}

export async function updateCharacter(
  id: string,
  data: { name?: string; banner?: BannerSettings; is_active?: boolean }
): Promise<Character> {
  const res = await fetch(`${API_BASE}/characters/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update character');
  return res.json();
}

export async function deleteCharacter(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/characters/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete character');
}

export async function getReminders(characterId?: string): Promise<Reminder[]> {
  const url = characterId ? `${API_BASE}/reminders?character_id=${characterId}` : `${API_BASE}/reminders`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch reminders');
  return res.json();
}

export async function createReminder(data: {
  character_id: string;
  title: string;
  message: string;
  scheduled_at: string;
}): Promise<Reminder> {
  const res = await fetch(`${API_BASE}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create reminder');
  return res.json();
}

export async function updateReminder(id: string, updates: Partial<Reminder>): Promise<Reminder> {
  const res = await fetch(`${API_BASE}/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update reminder');
  return res.json();
}

export async function deleteReminder(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/reminders/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete reminder');
}

export async function getCalendarStatus() {
  const res = await fetch(`${API_BASE}/calendar/status`);
  if (!res.ok) throw new Error('Failed to get calendar status');
  return res.json();
}

export async function getCalendarEvents() {
  const res = await fetch(`${API_BASE}/calendar/events`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to fetch calendar events');
  }
  return res.json();
}

export async function syncCalendarReminders(characterId?: string) {
  const url = characterId
    ? `${API_BASE}/calendar/sync-reminders?character_id=${characterId}`
    : `${API_BASE}/calendar/sync-reminders`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to sync calendar reminders');
  return res.json();
}

export async function getQuotes() {
  const res = await fetch(`${API_BASE}/calendar/quotes`);
  if (!res.ok) throw new Error('Failed to fetch quotes');
  return res.json();
}

