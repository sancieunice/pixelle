import React from 'react';
import { Trash2, Monitor, MessageSquare, Calendar } from 'lucide-react';
import { Character } from '../types';

interface CharacterCardProps {
  character: Character;
  isSelected: boolean;
  onSelect: (character: Character) => void;
  onSetActive: (character: Character) => void;
  onDelete: (id: string) => void;
  onOpenReminders: (character: Character) => void;
}

export const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  isSelected,
  onSelect,
  onSetActive,
  onDelete,
  onOpenReminders
}) => {
  return (
    <div
      onClick={() => onSelect(character)}
      className={`group relative bg-[#151D32] border rounded-2xl p-4 transition-all cursor-pointer flex flex-col justify-between ${
        isSelected
          ? 'border-[#A78BFA] ring-2 ring-[#A78BFA]/25 shadow-lg shadow-[#A78BFA]/10'
          : character.is_active
          ? 'border-[#A78BFA]/40 hover:border-[#A78BFA]/70'
          : 'border-[#252F49] hover:border-[#374468] hover:bg-[#1A243F]'
      }`}
    >
      <div>
        {/* Top badges */}
        <div className="flex items-center justify-between mb-2.5">
          {character.is_active ? (
            <span className="text-[10px] px-2.5 py-0.5 bg-[#A78BFA]/15 text-[#D8B4FE] border border-[#A78BFA]/30 rounded-full font-mono uppercase tracking-wider">
              Active Companion
            </span>
          ) : (
            <span className="text-[10px] text-[#9BA8C2]/60 font-mono">
              {character.id}
            </span>
          )}

          {character.banner.enabled && (
            <div className="flex items-center gap-1 text-[10px] text-[#F0A6CA] bg-[#F0A6CA]/10 px-2 py-0.5 rounded-full border border-[#F0A6CA]/20 font-mono">
              <MessageSquare className="w-3 h-3" />
              <span>Banner</span>
            </div>
          )}
        </div>

        {/* Thumbnail Viewport - More prominent and crisp */}
        <div className="w-full h-40 bg-[#0F1528] rounded-xl border border-[#252F49] flex items-center justify-center overflow-hidden mb-3.5 group-hover:border-[#374468] transition-all bg-checkerboard shadow-inner">
          <img
            src={character.sprite_scaled_url}
            alt={character.name}
            className="w-28 h-28 pixel-crisp drop-shadow-md transition-transform group-hover:scale-105"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Info */}
        <h4 className="font-heading font-bold text-[#F4F2FA] text-base truncate">{character.name}</h4>
        <p className="text-[#9BA8C2] text-xs line-clamp-2 mt-1 italic font-sans leading-relaxed">
          "{character.prompt}"
        </p>
      </div>

      {/* Actions */}
      <div className="mt-4 pt-3 border-t border-[#252F49] flex items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onSetActive(character)}
          title={character.is_active ? 'Already Active' : 'Set as Desktop Companion'}
          className={`py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
            character.is_active
              ? 'bg-[#A78BFA]/15 text-[#D8B4FE] border border-[#A78BFA]/30 cursor-default'
              : 'bg-[#0F1528] hover:bg-[#A78BFA] text-[#9BA8C2] hover:text-[#0B1020] border border-[#252F49] font-medium'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium">{character.is_active ? 'Active' : 'Set Active'}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenReminders(character)}
            title="Schedule Reminders"
            className="p-2 bg-[#0F1528] hover:bg-[#1A243F] text-[#9BA8C2] hover:text-[#D8B4FE] rounded-xl border border-[#252F49] transition-all cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete companion "${character.name}"?`)) {
                onDelete(character.id);
              }
            }}
            title="Delete Companion"
            className="p-2 bg-[#0F1528] hover:bg-red-500/15 text-[#9BA8C2] hover:text-red-400 rounded-xl border border-[#252F49] transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
