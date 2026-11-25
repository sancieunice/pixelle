import React, { useState, useEffect } from 'react';
import { Play, Pause, Footprints, Moon, Hand, Sparkles, Bell } from 'lucide-react';
import { Character, CompanionAction } from '../types';

interface CompanionSimulatorProps {
  character: Character;
  activeReminder?: string | null;
}

export const CompanionSimulator: React.FC<CompanionSimulatorProps> = ({
  character,
  activeReminder
}) => {
  const [action, setAction] = useState<CompanionAction>('idle');
  const [isAutonomous, setIsAutonomous] = useState<boolean>(true);
  const [posX, setPosX] = useState<number>(50); // percentage 10% - 90%
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [sleepZs, setSleepZs] = useState<{ id: number; left: number }[]>([]);

  // Interruption: when a reminder fires, interrupt whatever it's doing
  useEffect(() => {
    if (activeReminder) {
      setAction('reminder');
    }
  }, [activeReminder]);

  // Floating Zzz generator when sleeping
  useEffect(() => {
    if (action !== 'sleep') {
      setSleepZs([]);
      return;
    }
    const interval = setInterval(() => {
      setSleepZs((prev) => [
        ...prev.slice(-3),
        { id: Date.now(), left: Math.random() * 20 - 10 }
      ]);
    }, 1200);
    return () => clearInterval(interval);
  }, [action]);

  // Autonomous Behaviour State Machine (weighted random)
  useEffect(() => {
    if (!isAutonomous || action === 'reminder') return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const selectNextAction = () => {
      const rand = Math.random();
      let nextAction: CompanionAction = 'idle';
      let duration = 3500;

      if (rand < 0.40) {
        nextAction = 'idle';
        duration = 3000 + Math.random() * 2000;
      } else if (rand < 0.65) {
        nextAction = 'walk';
        duration = 3000 + Math.random() * 2500;
        // Pick new random direction and target position
        const target = Math.max(15, Math.min(85, posX + (Math.random() > 0.5 ? 25 : -25)));
        setDirection(target > posX ? 'right' : 'left');
        setPosX(target);
      } else if (rand < 0.80) {
        nextAction = 'look_around';
        duration = 2000;
        setDirection((d) => (d === 'left' ? 'right' : 'left'));
      } else if (rand < 0.95) {
        nextAction = 'sleep';
        duration = 5000 + Math.random() * 3000;
      } else {
        nextAction = 'wave';
        duration = 2500;
      }

      setAction(nextAction);
      timeoutId = setTimeout(selectNextAction, duration);
    };

    timeoutId = setTimeout(selectNextAction, 3000);
    return () => clearTimeout(timeoutId);
  }, [isAutonomous, posX, action]);

  return (
    <div className="bg-[#151D32] border border-[#252F49] rounded-2xl p-6 shadow-xl flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#A78BFA]/15 text-[#A78BFA] rounded-xl border border-[#A78BFA]/20">
            <Footprints className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-[#F4F2FA] text-base">Companion Behaviour Engine</h3>
            <p className="text-[#9BA8C2] text-xs">Simulates the desktop companion's state machine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAutonomous(!isAutonomous)}
            className={`text-xs px-3.5 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer font-medium ${
              isAutonomous
                ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2]'
            }`}
          >
            {isAutonomous ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isAutonomous ? 'Autonomous: ON' : 'Autonomous: PAUSED'}
          </button>
        </div>
      </div>

      {/* Stage Canvas */}
      <div className="relative w-full h-64 bg-gradient-to-b from-[#0B1020] to-[#0F1528] rounded-2xl border border-[#252F49] overflow-hidden flex flex-col justify-end p-4 shadow-inner">
        {/* Floor Line */}
        <div className="absolute bottom-6 left-0 right-0 h-0.5 bg-[#252F49]" />

        {/* Character Object */}
        <div
          className="absolute bottom-6 transition-all ease-out flex flex-col items-center"
          style={{
            left: `${posX}%`,
            transform: `translateX(-50%)`,
            transitionDuration: action === 'walk' ? '2.5s' : '0.4s'
          }}
        >
          {/* Active Reminder or Dialogue Bubble */}
          {(action === 'reminder' || character.banner.enabled) && (
            <div className="relative mb-2 animate-bounce max-w-[200px] z-20">
              <div
                style={{ backgroundColor: action === 'reminder' ? '#FEF08A' : character.banner.color }}
                className="px-3.5 py-1.5 rounded-xl border-2 border-[#0B1020] shadow-md text-xs font-bold text-slate-900 text-center relative"
              >
                {action === 'reminder' ? (
                  <div className="flex items-center gap-1.5 text-amber-950">
                    <Bell className="w-3 h-3 text-red-600 animate-spin" />
                    <span>{activeReminder || 'Reminder due!'}</span>
                  </div>
                ) : (
                  <span>{character.banner.text || 'Hello!'}</span>
                )}
                {/* Bubble tail */}
                <div
                  style={{ borderTopColor: action === 'reminder' ? '#FEF08A' : character.banner.color }}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-8"
                />
              </div>
            </div>
          )}

          {/* Floating Zzz Particles when Sleeping */}
          {action === 'sleep' && (
            <div className="relative w-full h-8 mb-1 pointer-events-none">
              {sleepZs.map((z) => (
                <span
                  key={z.id}
                  className="absolute text-[#D8B4FE] font-bold font-mono text-xs animate-float-z"
                  style={{ left: `calc(50% + ${z.left}px)` }}
                >
                  Zzz
                </span>
              ))}
            </div>
          )}

          {/* Character Sprite with animation classes */}
          <div
            className={`transition-transform duration-300 ${
              action === 'walk'
                ? 'animate-bounce'
                : action === 'sleep'
                ? 'scale-90 translate-y-3 opacity-80'
                : action === 'wave'
                ? 'animate-wiggle'
                : action === 'celebrate'
                ? 'animate-bounce scale-110'
                : 'animate-pulse'
            }`}
          >
            <img
              src={character.sprite_scaled_url}
              alt={character.name}
              className={`w-32 h-32 pixel-crisp select-none transition-transform ${
                direction === 'left' ? '-scale-x-100' : 'scale-x-100'
              }`}
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>

        {/* State Badge in stage bottom left */}
        <div className="absolute bottom-2.5 left-3 flex items-center gap-2 bg-[#0B1020]/90 px-3 py-1 rounded-lg border border-[#252F49] text-[11px] text-[#9BA8C2] font-mono">
          <span className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
          <span>State: <strong className="text-[#F4F2FA] uppercase">{action}</strong></span>
        </div>
      </div>

      {/* Manual Action Triggers */}
      <div className="mt-4 pt-3.5 border-t border-[#252F49]">
        <span className="text-xs text-[#9BA8C2] font-medium block mb-2 font-mono uppercase tracking-wider">Manual Action Triggers:</span>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => setAction('idle')}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1 ${
              action === 'idle'
                ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#1A243F]'
            }`}
          >
            Stand Idle
          </button>
          <button
            type="button"
            onClick={() => {
              setAction('walk');
              const target = posX > 50 ? 25 : 75;
              setDirection(target > posX ? 'right' : 'left');
              setPosX(target);
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              action === 'walk'
                ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#1A243F]'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" />
            Walk
          </button>
          <button
            type="button"
            onClick={() => setAction('sleep')}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              action === 'sleep'
                ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#1A243F]'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            Sleep
          </button>
          <button
            type="button"
            onClick={() => setAction('wave')}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              action === 'wave'
                ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#1A243F]'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            Wave
          </button>
          <button
            type="button"
            onClick={() => setAction('celebrate')}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              action === 'celebrate'
                ? 'bg-[#A78BFA]/15 border-[#A78BFA]/40 text-[#D8B4FE]'
                : 'bg-[#0F1528] border-[#252F49] text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#1A243F]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Celebrate
          </button>
        </div>
      </div>
    </div>
  );
};
