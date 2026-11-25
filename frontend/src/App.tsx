import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Heart,
  Calendar,
  RefreshCw,
  Cpu,
  Layers,
} from "lucide-react";
import { Character, BannerSettings, GenerateParams } from "./types";
import * as api from "./services/api";
import { PromptInput } from "./components/PromptInput";
import { CharacterPreview } from "./components/CharacterPreview";
import { BannerEditor } from "./components/BannerEditor";
import { CompanionSimulator } from "./components/CompanionSimulator";
import { CharacterCard } from "./components/CharacterCard";
import { ReminderModal } from "./components/ReminderModal";
import { CalendarView } from "./components/CalendarView";

export const App: React.FC = () => {
  const [tab, setTab] = useState<"studio" | "collection" | "calendar">(
    "studio",
  );
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [bannerDraft, setBannerDraft] = useState<BannerSettings>({
    enabled: true,
    text: "Hey! Don't forget your meeting!",
    style: "bubble",
    color: "#FFFFFF",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [activeReminderTest, setActiveReminderTest] = useState<string | null>(
    null,
  );
  const [reminderModalChar, setReminderModalChar] = useState<Character | null>(
    null,
  );
  const [health, setHealth] = useState<{
    status: string;
    device: string;
    cuda_available: boolean;
  } | null>(null);

  const fetchCharacters = async () => {
    try {
      const list = await api.getCharacters();
      setCharacters(list);
      // If none selected, pick the active one or first one
      if (list.length > 0 && !selectedChar) {
        const active = list.find((c) => c.is_active) || list[0];
        setSelectedChar(active);
        setBannerDraft(active.banner);
      }
    } catch (err) {
      console.error("Failed to load characters:", err);
    }
  };

  const checkBackendHealth = async () => {
    try {
      const data = await api.checkHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  };

  useEffect(() => {
    fetchCharacters();
    checkBackendHealth();
  }, []);

  const handleGenerate = async (params: GenerateParams) => {
    setIsLoading(true);
    try {
      const newChar = await api.generateCharacter(params);
      setCharacters((prev) => [newChar, ...prev]);
      setSelectedChar(newChar);
      setBannerDraft(newChar.banner);
      setTab("studio");
    } catch (err: any) {
      alert(err.message || "Generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCharacter = (char: Character) => {
    setSelectedChar(char);
    setBannerDraft(char.banner);
  };

  const handleSetActive = async (char: Character) => {
    try {
      await api.updateCharacter(char.id, { is_active: true });
      setCharacters((prev) =>
        prev.map((c) => ({
          ...c,
          is_active: c.id === char.id,
        })),
      );
      if (selectedChar?.id === char.id) {
        setSelectedChar({ ...selectedChar, is_active: true });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveBanner = async () => {
    if (!selectedChar) return;
    setIsSavingBanner(true);
    try {
      const updated = await api.updateCharacter(selectedChar.id, {
        banner: bannerDraft,
      });
      setSelectedChar(updated);
      setCharacters((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      alert("Banner configuration saved!");
    } catch (err: any) {
      alert(err.message || "Failed to save banner");
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    try {
      await api.deleteCharacter(id);
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      if (selectedChar?.id === id) {
        setSelectedChar(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const activeCompanion = characters.find((c) => c.is_active);

  return (
    <div className="min-h-screen bg-[#0B1020] text-[#F4F2FA] flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-[#252F49] bg-[#151D32]/90 backdrop-blur-md sticky top-0 z-40 w-full shadow-lg shadow-black/25">
        <div className="w-full px-6 sm:px-10 lg:px-14 h-20 flex items-center justify-between">
          <div>
            <h1 className="font-heading font-black text-3xl tracking-wider text-[#F4F2FA]">
              PIXELLE
            </h1>
            <p className="text-xs text-[#9BA8C2] font-mono uppercase tracking-widest -mt-0.5">
              AI Desktop Companion
            </p>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-[#0F1528] p-1.5 rounded-2xl border border-[#252F49]">
            <button
              type="button"
              onClick={() => setTab("studio")}
              className={`px-4.5 py-2.5 rounded-xl text-base font-semibold transition-all cursor-pointer flex items-center gap-2.5 ${
                tab === "studio"
                  ? "bg-[#A78BFA] text-[#0B1020] shadow-sm"
                  : "text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#151D32]"
              }`}
            >
              <Sparkles className="w-4.5 h-4.5" />
              Studio
            </button>
            <button
              type="button"
              onClick={() => setTab("collection")}
              className={`px-4.5 py-2.5 rounded-xl text-base font-semibold transition-all cursor-pointer flex items-center gap-2.5 ${
                tab === "collection"
                  ? "bg-[#A78BFA] text-[#0B1020] shadow-sm"
                  : "text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#151D32]"
              }`}
            >
              <Layers className="w-4.5 h-4.5" />
              Companions ({characters.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("calendar")}
              className={`px-4.5 py-2.5 rounded-xl text-base font-semibold transition-all cursor-pointer flex items-center gap-2.5 ${
                tab === "calendar"
                  ? "bg-[#A78BFA] text-[#0B1020] shadow-sm"
                  : "text-[#9BA8C2] hover:text-[#F4F2FA] hover:bg-[#151D32]"
              }`}
            >
              <Calendar className="w-4.5 h-4.5" />
              Calendar
            </button>
          </nav>

          {/* Hardware & Active Companion Badge */}
          <div className="hidden sm:flex items-center gap-3">
            {health && (
              <div className="flex items-center gap-2 bg-[#0F1528] border border-[#252F49] px-3.5 py-2 rounded-xl text-xs text-[#9BA8C2] font-mono">
                <Cpu
                  className={`w-4 h-4 ${health.cuda_available ? "text-[#A78BFA]" : "text-amber-400"}`}
                />
                <span>{health.device}</span>
              </div>
            )}

            {activeCompanion && (
              <div className="flex items-center gap-2.5 bg-[#0F1528] border border-[#252F49] hover:border-[#A78BFA]/40 px-4 py-2 rounded-xl text-sm transition-colors">
                <img
                  src={activeCompanion.sprite_scaled_url}
                  alt={activeCompanion.name}
                  className="w-5.5 h-5.5 pixel-crisp"
                />
                <span className="font-semibold text-[#D8B4FE]">
                  {activeCompanion.name}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container - Slightly increased side gaps */}
      <main className="w-full px-6 sm:px-10 lg:px-14 py-7 flex-1 flex flex-col">
        {/* TAB 1: STUDIO */}
        {tab === "studio" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 w-full flex-1 items-start">
            {/* Left Column: Prompt Input & Banner Editor */}
            <div className="xl:col-span-5 space-y-6">
              <PromptInput onGenerate={handleGenerate} isLoading={isLoading} />
              <BannerEditor
                banner={bannerDraft}
                onChange={setBannerDraft}
                onSave={selectedChar ? handleSaveBanner : undefined}
                isSaving={isSavingBanner}
              />
            </div>

            {/* Right Column: Character Preview & Live Behaviour Simulator */}
            <div className="xl:col-span-7 space-y-6">
              <CharacterPreview
                character={selectedChar}
                bannerOverride={bannerDraft}
                onSetActive={handleSetActive}
                isLoading={isLoading}
              />

              {selectedChar && (
                <CompanionSimulator
                  character={selectedChar}
                  activeReminder={activeReminderTest}
                />
              )}
            </div>
          </div>
        )}

        {/* TAB 2: COMPANION COLLECTION */}
        {tab === "collection" && (
          <div className="w-full space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-2xl font-bold text-[#F4F2FA]">
                  Your Character Collection
                </h2>
                <p className="text-[#9BA8C2] text-xs mt-1">
                  Click any companion to view, edit banner dialogue, or launch
                  as your desktop pet.
                </p>
              </div>

              <button
                type="button"
                onClick={fetchCharacters}
                className="px-4 py-2 bg-[#151D32] hover:bg-[#1A243F] text-[#F4F2FA] rounded-xl border border-[#252F49] text-xs font-medium flex items-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#A78BFA]" />
                Refresh
              </button>
            </div>

            {characters.length === 0 ? (
              <div className="bg-[#151D32] border border-[#252F49] border-dashed rounded-3xl p-14 text-center">
                <Heart className="w-12 h-12 text-[#9BA8C2]/40 mx-auto mb-3" />
                <h3 className="font-heading text-[#F4F2FA] font-bold text-lg">
                  No Companions Yet
                </h3>
                <p className="text-[#9BA8C2] text-xs max-w-sm mx-auto mt-1 mb-5">
                  Create your first AI-generated pixel companion in the
                  Character Studio.
                </p>
                <button
                  type="button"
                  onClick={() => setTab("studio")}
                  className="px-5 py-2.5 bg-[#A78BFA] hover:bg-[#9066F7] text-[#0B1020] font-semibold rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                >
                  Go to Studio
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 w-full">
                {characters.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    isSelected={selectedChar?.id === c.id}
                    onSelect={(char) => {
                      handleSelectCharacter(char);
                      setTab("studio");
                    }}
                    onSetActive={handleSetActive}
                    onDelete={handleDeleteCharacter}
                    onOpenReminders={(char) => setReminderModalChar(char)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CALENDAR */}
        {tab === "calendar" && (
          <div className="w-full">
            <CalendarView
              activeCompanion={activeCompanion || null}
              onRefreshReminders={fetchCharacters}
              onOpenReminders={(char) => setReminderModalChar(char)}
            />
          </div>
        )}
      </main>

      {/* Reminder Modal */}
      {reminderModalChar && (
        <ReminderModal
          character={reminderModalChar}
          onClose={() => setReminderModalChar(null)}
          onReminderTriggered={(msg) => {
            setActiveReminderTest(msg);
            setTimeout(() => setActiveReminderTest(null), 8000);
          }}
        />
      )}
    </div>
  );
};
