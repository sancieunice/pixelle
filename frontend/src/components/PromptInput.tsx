import React, { useState } from 'react';
import { Sparkles, Sliders, Wand2 } from 'lucide-react';
import { GenerateParams } from '../types';

interface PromptInputProps {
  onGenerate: (params: GenerateParams) => void;
  isLoading: boolean;
}

const PRESETS = [
  "baby pink cute cat",
  "Nilambari, wearing sunglasses and a green saree",
  "cyberpunk pixel warrior with glowing katana",
  "tiny green wizard frog holding a magical staff",
  "golden robotic puppy with neon blue eyes",
  "steampunk detective owl with top hat and monocle"
];

export const PromptInput: React.FC<PromptInputProps> = ({ onGenerate, isLoading }) => {
  const [prompt, setPrompt] = useState('baby pink cute cat');
  const [name, setName] = useState('');
  const [steps, setSteps] = useState(16);
  const [cfgScale, setCfgScale] = useState(3.0);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onGenerate({
      prompt: prompt.trim(),
      name: name.trim() || undefined,
      steps,
      cfg_scale: cfgScale,
      seed: seed !== undefined && !isNaN(seed) ? seed : undefined
    });
  };

  return (
    <div className="bg-[#151D32] border border-[#252F49] rounded-2xl p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-[#A78BFA]/15 text-[#A78BFA] rounded-xl border border-[#A78BFA]/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="font-heading text-xl font-bold text-[#F4F2FA]">Generate Companion</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`text-xs px-3.5 py-2 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
            showAdvanced
              ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
              : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          {showAdvanced ? 'Hide Advanced' : 'Advanced'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-[#9BA8C2] mb-1.5 uppercase tracking-wider font-mono">
            Character Prompt
          </label>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your companion (e.g. cute red panda in space suit)..."
              rows={3}
              maxLength={240}
              disabled={isLoading}
              className="w-full bg-[#0F1528] border border-[#252F49] rounded-xl px-4 py-3 text-[#F4F2FA] placeholder-[#6C7A9C] focus:outline-none focus:border-[#A78BFA] focus:ring-1 focus:ring-[#A78BFA]/30 resize-none text-base transition-all"
            />
            <span className="absolute bottom-3 right-3 text-xs text-[#9BA8C2]/60 font-mono">
              {prompt.length}/240
            </span>
          </div>
        </div>

        {/* Prompt presets */}
        <div>
          <span className="text-xs font-semibold text-[#9BA8C2] block mb-2 uppercase tracking-wider font-mono">
            Popular Ideas:
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(p)}
                disabled={isLoading}
                className="text-sm px-3.5 py-1.5 bg-[#0F1528] hover:bg-[#1A243F] text-[#9BA8C2] hover:text-[#F4F2FA] rounded-xl border border-[#252F49] hover:border-[#A78BFA]/30 transition-all text-left cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#9BA8C2] mb-1.5 uppercase tracking-wider font-mono">
              Companion Name (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mochi, Nilambari, Sparky"
              maxLength={40}
              disabled={isLoading}
              className="w-full bg-[#0F1528] border border-[#252F49] rounded-xl px-4 py-3 text-base text-[#F4F2FA] placeholder-[#6C7A9C] focus:outline-none focus:border-[#A78BFA] focus:ring-1 focus:ring-[#A78BFA]/30"
            />
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-3 gap-2 bg-[#0F1528] p-2.5 rounded-xl border border-[#252F49]">
              <div>
                <label className="block text-[11px] font-mono text-[#9BA8C2] mb-1 uppercase">
                  Steps ({steps})
                </label>
                <input
                  type="range"
                  min="4"
                  max="32"
                  value={steps}
                  onChange={(e) => setSteps(Number(e.target.value))}
                  className="w-full accent-[#A78BFA] cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#9BA8C2] mb-1 uppercase">
                  CFG ({cfgScale})
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="8.0"
                  step="0.5"
                  value={cfgScale}
                  onChange={(e) => setCfgScale(Number(e.target.value))}
                  className="w-full accent-[#A78BFA] cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#9BA8C2] mb-1 uppercase">
                  Seed
                </label>
                <input
                  type="number"
                  placeholder="Random"
                  value={seed === undefined ? '' : seed}
                  onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-[#151D32] border border-[#252F49] rounded-lg px-2.5 py-1.5 text-xs text-[#F4F2FA] focus:outline-none focus:border-[#A78BFA]"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full py-4 px-4 bg-[#A78BFA] hover:bg-[#9066F7] text-[#0B1020] font-heading font-bold text-base rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-[#0B1020]/30 border-t-[#0B1020] rounded-full animate-spin" />
              <span>Synthesizing Pixel Tokens...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              <span>Create My Companion</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
