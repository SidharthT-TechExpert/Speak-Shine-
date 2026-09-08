export const STREAK_BADGES = [
  { id: "first-steps", days: 3, icon: "🌱", name: "First Steps", tier: "Green", color: "#4ade80" },
  { id: "momentum-builder", days: 5, icon: "🌿", name: "Momentum Builder", tier: "Sprout", color: "#86efac" },
  { id: "consistent-speaker", days: 7, icon: "🔥", name: "Consistent Speaker", tier: "Bronze", color: "#cd7f32" },
  { id: "fearless-voice", days: 10, icon: "🎙️", name: "Fearless Voice", tier: "Copper", color: "#f59e0b" },
  { id: "rising-communicator", days: 14, icon: "⭐", name: "Rising Communicator", tier: "Silver", color: "#cbd5e1" },
  { id: "three-week-voice", days: 21, icon: "🌟", name: "Three-Week Voice", tier: "Amber", color: "#fbbf24" },
  { id: "dedicated-speaker", days: 30, icon: "💎", name: "Dedicated Speaker", tier: "Gold", color: "#facc15" },
  { id: "voice-virtuoso", days: 45, icon: "🎼", name: "Voice Virtuoso", tier: "Emerald", color: "#34d399" },
  { id: "elite-communicator", days: 60, icon: "🚀", name: "Elite Communicator", tier: "Platinum", color: "#67e8f9" },
  { id: "momentum-master", days: 75, icon: "⚡", name: "Momentum Master", tier: "Sapphire", color: "#38bdf8" },
  { id: "unstoppable-speaker", days: 90, icon: "🦁", name: "Unstoppable Speaker", tier: "Amethyst", color: "#c084fc" },
  { id: "speech-legend", days: 100, icon: "👑", name: "Speech Legend", tier: "Diamond", color: "#a78bfa" },
  { id: "communication-titan", days: 120, icon: "🗿", name: "Communication Titan", tier: "Obsidian", color: "#94a3b8" },
  { id: "fluency-champion", days: 150, icon: "🏅", name: "Fluency Champion", tier: "Ruby", color: "#f43f5e" },
  { id: "hall-of-fame", days: 180, icon: "🏆", name: "Hall of Fame", tier: "Ruby", color: "#fb7185" },
  { id: "legendary-voice", days: 240, icon: "🔱", name: "Legendary Voice", tier: "Titanium", color: "#e2e8f0" },
  { id: "oratory-icon", days: 300, icon: "🏛️", name: "Oratory Icon", tier: "Diamond+", color: "#818cf8" },
  { id: "master-orator", days: 365, icon: "🌍", name: "Master Orator", tier: "Rainbow", color: "#f472b6", animated: true },
  { id: "immortal-orator", days: 500, icon: "☄️", name: "Immortal Orator", tier: "Cosmic", color: "#e879f9", animated: true },
  { id: "two-year-voice", days: 730, icon: "🌌", name: "Two-Year Voice", tier: "Eternal", color: "#f0abfc", animated: true },
];

/**
 * Returns the highest badge earned for a given streak number of days.
 */
export function getBadgeForStreak(streakDays = 0) {
  const earned = STREAK_BADGES.filter(b => streakDays >= b.days);
  return earned.length > 0 ? earned[earned.length - 1] : null;
}

/**
 * Returns the next upcoming badge that has not been reached yet.
 */
export function getNextBadgeForStreak(streakDays = 0) {
  return STREAK_BADGES.find(b => streakDays < b.days) || null;
}

/**
 * Returns complete progress info towards the next milestone badge.
 */
export function getBadgeProgress(streakDays = 0) {
  const currentBadge = getBadgeForStreak(streakDays);
  const nextBadge = getNextBadgeForStreak(streakDays);

  if (!nextBadge) {
    return {
      currentBadge,
      nextBadge: null,
      currentDays: streakDays,
      targetDays: streakDays,
      remainingDays: 0,
      percent: 100,
      startDays: currentBadge?.days || 0,
    };
  }

  const startDays = currentBadge ? currentBadge.days : 0;
  const targetDays = nextBadge.days;
  const remainingDays = Math.max(0, targetDays - streakDays);
  const span = targetDays - startDays;
  const percent = span > 0
    ? Math.min(100, Math.max(0, Math.round(((streakDays - startDays) / span) * 100)))
    : 0;

  return {
    currentBadge,
    nextBadge,
    currentDays: streakDays,
    targetDays,
    remainingDays,
    percent,
    startDays,
  };
}

export function getStreakBadges(user = {}) {
  const earnedIds = new Set(user.earnedBadges || []);
  return STREAK_BADGES.filter(badge => earnedIds.has(badge.id) || (user.streak || 0) >= badge.days);
}
