export interface BannerSettings {
  enabled: boolean;
  text: string;
  style: 'bubble' | 'sign' | 'scroll';
  color: string;
}

export interface Character {
  id: string;
  name: string;
  prompt: string;
  sprite_raw_url: string;
  sprite_scaled_url: string;
  banner: BannerSettings;
  is_active: boolean;
  created_at: string;
}

export interface Reminder {
  id: string;
  character_id: string;
  title: string;
  message: string;
  scheduled_at: string;
  status: 'pending' | 'delivered' | 'dismissed';
  created_at: string;
}

export interface GenerateParams {
  prompt: string;
  name?: string;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
}

export type CompanionAction = 'idle' | 'walk' | 'sleep' | 'look_around' | 'wave' | 'celebrate' | 'reminder';
