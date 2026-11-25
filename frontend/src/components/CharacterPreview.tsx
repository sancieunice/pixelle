import React, { useState } from 'react';
import { Download, ZoomIn, ZoomOut, Monitor, Heart } from 'lucide-react';
import { Character, BannerSettings } from '../types';

interface CharacterPreviewProps {
  character: Character | null;
  bannerOverride?: BannerSettings;
  onSetActive?: (character: Character) => void;
  isLoading?: boolean;
}

export const CharacterPreview: React.FC<CharacterPreviewProps> = ({
  character,
  bannerOverride,
  onSetActive,
  isLoading = false
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [bgStyle, setBgStyle] = useState<'checker' | 'slate' | 'dark'>('checker');

  if (isLoading) {
    return (
      <div className="bg-[#151D32] border border-[#252F49] rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-14 h-14 border-3 border-[#A78BFA]/20 border-t-[#A78BFA] rounded-full animate-spin mb-4" />
        <p className="font-heading font-semibold text-[#F4F2FA] text-base">Weaving 256 pixel tokens...</p>
        <p className="text-[#9BA8C2] text-xs mt-1 font-mono">Applying discrete diffusion unmasking on GPU</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="bg-[#151D32] border border-[#252F49] border-dashed rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-16 h-16 bg-[#0F1528] rounded-2xl flex items-center justify-center text-[#9BA8C2]/40 mb-3 border border-[#252F49]">
          <Heart className="w-7 h-7" />
        </div>
        <p className="font-heading text-[#F4F2FA] font-bold text-base">No Companion Selected</p>
        <p className="text-[#9BA8C2] text-xs max-w-xs mt-1.5">
          Type a prompt on the left or choose a companion from your collection to view and animate.
        </p>
      </div>
    );
  }

  const banner = bannerOverride || character.banner;
  const isDarkBanner = banner.color.toLowerCase() === '#151d32' || banner.color.toLowerCase() === '#1e293b';

  return (
    <div className="bg-[#151D32] border border-[#252F49] rounded-2xl p-6 shadow-xl flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-bold text-[#F4F2FA] text-2xl flex items-center gap-3">
            {character.name}
            {character.is_active && (
              <span className="text-xs px-3 py-0.5 bg-[#A78BFA]/15 text-[#D8B4FE] border border-[#A78BFA]/30 rounded-full font-mono uppercase tracking-wider">
                Active Companion
              </span>
            )}
          </h3>
          <p className="text-[#9BA8C2] text-sm truncate max-w-md mt-1 font-mono">
            "{character.prompt}"
          </p>
        </div>

        {/* Viewport controls */}
        <div className="flex items-center gap-1.5 bg-[#0F1528] p-1.5 rounded-xl border border-[#252F49]">
          <button
            type="button"
            onClick={() => setBgStyle(bgStyle === 'checker' ? 'slate' : bgStyle === 'slate' ? 'dark' : 'checker')}
            className="text-[11px] px-2.5 py-1 text-[#9BA8C2] hover:text-[#F4F2FA] rounded-lg transition-all cursor-pointer font-mono"
            title="Toggle background style"
          >
            {bgStyle === 'checker' ? 'Grid' : bgStyle === 'slate' ? 'Navy' : 'Dark'}
          </button>
          <div className="w-px h-4 bg-[#252F49]" />
          <button
            type="button"
            onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
            className="p-1 text-[#9BA8C2] hover:text-[#F4F2FA] rounded-lg cursor-pointer"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-[#9BA8C2] font-mono px-1">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom(Math.min(1.75, zoom + 0.25))}
            className="p-1 text-[#9BA8C2] hover:text-[#F4F2FA] rounded-lg cursor-pointer"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport - Prominent and Crisp */}
      <div
        className={`relative w-full h-80 rounded-2xl border border-[#252F49] flex flex-col items-center justify-center overflow-hidden transition-all shadow-inner ${
          bgStyle === 'checker'
            ? 'bg-checkerboard'
            : bgStyle === 'slate'
            ? 'bg-[#151D32]'
            : 'bg-[#0B1020]'
        }`}
      >
        <div
          className="flex flex-col items-center justify-center transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* Banner Speech Bubble */}
          {banner.enabled && (
            <div className="relative mb-3 animate-bounce-subtle z-10 max-w-[240px]">
              {banner.style === 'bubble' && (
                <div
                  style={{ backgroundColor: banner.color }}
                  className={`px-3.5 py-1.5 rounded-xl border-2 border-[#0B1020] shadow-md text-xs font-semibold text-center relative ${
                    isDarkBanner ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  <p className="leading-tight break-words">{banner.text || '...'}</p>
                  <div
                    style={{ borderTopColor: banner.color }}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-8"
                  />
                </div>
              )}

              {banner.style === 'sign' && (
                <div
                  style={{ backgroundColor: banner.color }}
                  className={`px-3.5 py-1.5 rounded-none border-2 border-amber-900 shadow-md text-xs font-bold text-center relative ${
                    isDarkBanner ? 'text-white' : 'text-amber-950'
                  }`}
                >
                  <p className="leading-tight break-words font-mono uppercase text-[11px] tracking-wider">
                    {banner.text || '...'}
                  </p>
                </div>
              )}

              {banner.style === 'scroll' && (
                <div
                  style={{ backgroundColor: banner.color }}
                  className={`px-4 py-1.5 rounded-lg border border-amber-800/60 shadow-md text-xs italic text-center relative ${
                    isDarkBanner ? 'text-white' : 'text-amber-900'
                  }`}
                >
                  <p className="leading-tight break-words font-serif">{banner.text || '...'}</p>
                </div>
              )}
            </div>
          )}

          {/* Sprite image (prominent, 256x256 pixelated) */}
          <img
            src={character.sprite_scaled_url}
            alt={character.name}
            className="w-52 h-52 pixel-crisp drop-shadow-md select-none"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#252F49]">
        <div className="flex items-center gap-2">
          <a
            href={character.sprite_scaled_url}
            download={`${character.name}_256x256.png`}
            className="px-3.5 py-2 bg-[#0F1528] hover:bg-[#1A243F] text-[#9BA8C2] hover:text-[#F4F2FA] rounded-xl border border-[#252F49] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#A78BFA]" />
            256px PNG
          </a>
          <a
            href={character.sprite_raw_url}
            download={`${character.name}_16x16.png`}
            className="px-3.5 py-2 bg-[#0F1528] hover:bg-[#1A243F] text-[#9BA8C2] hover:text-[#F4F2FA] rounded-xl border border-[#252F49] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer font-mono"
          >
            <Download className="w-3.5 h-3.5 text-[#A78BFA]" />
            Raw 16px
          </a>
        </div>

        {onSetActive && (
          <button
            type="button"
            onClick={() => onSetActive(character)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              character.is_active
                ? 'bg-[#A78BFA]/15 text-[#D8B4FE] border border-[#A78BFA]/40 cursor-default'
                : 'bg-[#A78BFA] hover:bg-[#9066F7] text-[#0B1020] shadow-sm font-bold'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            {character.is_active ? 'Active Desktop Companion' : 'Set as Desktop Companion'}
          </button>
        )}
      </div>
    </div>
  );
};
