import React from 'react';
import { MessageSquare, Shield, Scroll, Check } from 'lucide-react';
import { BannerSettings } from '../types';

interface BannerEditorProps {
  banner: BannerSettings;
  onChange: (banner: BannerSettings) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

const PALETTE_COLORS = [
  { label: 'Cloud White', value: '#FFFFFF' },
  { label: 'Warm Cream', value: '#FFF8DC' },
  { label: 'Pastel Pink', value: '#FFD1DC' },
  { label: 'Mint Green', value: '#D0F0C0' },
  { label: 'Sky Blue', value: '#BAE6FD' },
  { label: 'Lavender', value: '#E9D5FF' },
  { label: 'Retro Yellow', value: '#FEF08A' },
  { label: 'Cyber Dark', value: '#151D32' }
];

export const BannerEditor: React.FC<BannerEditorProps> = ({
  banner,
  onChange,
  onSave,
  isSaving = false
}) => {
  return (
    <div className="bg-[#151D32] border border-[#252F49] rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#F0A6CA]/15 text-[#F0A6CA] rounded-xl border border-[#F0A6CA]/20">
            <MessageSquare className="w-4 h-4" />
          </div>
          <h3 className="font-heading font-bold text-[#F4F2FA] text-base">Banner & Dialogue</h3>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-[#9BA8C2] font-medium">Show Banner</span>
          <input
            type="checkbox"
            checked={banner.enabled}
            onChange={(e) => onChange({ ...banner, enabled: e.target.checked })}
            className="w-4 h-4 rounded accent-[#A78BFA] cursor-pointer"
          />
        </label>
      </div>

      {banner.enabled && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#9BA8C2] mb-1.5 uppercase tracking-wider font-mono">
              Speech Bubble Text
            </label>
            <input
              type="text"
              value={banner.text}
              onChange={(e) => onChange({ ...banner, text: e.target.value })}
              placeholder="e.g. Don't forget your 3:00 PM meeting!"
              maxLength={60}
              className="w-full bg-[#0F1528] border border-[#252F49] rounded-xl px-3.5 py-2.5 text-sm text-[#F4F2FA] placeholder-[#6C7A9C] focus:outline-none focus:border-[#A78BFA] focus:ring-1 focus:ring-[#A78BFA]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA8C2] mb-1.5 uppercase tracking-wider font-mono">
              Banner Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...banner, style: 'bubble' })}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  banner.style === 'bubble'
                    ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                    : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Bubble
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...banner, style: 'sign' })}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  banner.style === 'sign'
                    ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                    : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Sign
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...banner, style: 'scroll' })}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  banner.style === 'scroll'
                    ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                    : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA]'
                }`}
              >
                <Scroll className="w-3.5 h-3.5" />
                Scroll
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA8C2] mb-1.5 uppercase tracking-wider font-mono">
              Background Color
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => onChange({ ...banner, color: c.value })}
                  style={{ backgroundColor: c.value }}
                  className={`w-7 h-7 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                    banner.color.toLowerCase() === c.value.toLowerCase()
                      ? 'border-[#A78BFA] scale-110 shadow-sm ring-2 ring-[#A78BFA]/40'
                      : 'border-[#252F49] hover:scale-105'
                  }`}
                >
                  {banner.color.toLowerCase() === c.value.toLowerCase() && (
                    <Check className={`w-3.5 h-3.5 ${c.value === '#151D32' ? 'text-white' : 'text-slate-900'}`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="w-full mt-2 py-2.5 px-4 bg-[#0F1528] hover:bg-[#1A243F] text-[#F4F2FA] text-xs font-medium rounded-xl border border-[#252F49] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Banner Configuration'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
