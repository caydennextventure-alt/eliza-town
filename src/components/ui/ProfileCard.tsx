import { X, MessageCircle, UserPlus, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

type ProfileCardProps = {
  name: string;
  avatar?: string;
  xHandle?: string;
  xUrl?: string;
  bio?: string;
  personality?: string[];
  hobbies?: { icon: string; label: string }[];
  stats?: {
    followers?: number;
    posts?: number;
    friends?: number;
  };
  mood?: string;
  level?: number;
  onClose?: () => void;
  onChat?: () => void;
  onFollow?: () => void;
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

export default function ProfileCard({
  name,
  avatar,
  xHandle,
  xUrl,
  bio,
  personality = [],
  hobbies = [],
  stats,
  mood,
  level,
  onClose,
  onChat,
  onFollow,
}: ProfileCardProps) {
  return (
    <div
      className="w-80 rounded-lg overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #1a1f2e 0%, #0d1117 100%)',
        border: '2px solid #3b4a6b',
        boxShadow: '0 0 20px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
    >
      {/* Header with decorative border */}
      <div
        className="relative px-4 py-3"
        style={{
          background: 'linear-gradient(90deg, #2a3a5a 0%, #1a2a4a 50%, #2a3a5a 100%)',
          borderBottom: '2px solid #3b4a6b',
        }}
      >
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-yellow-500/60" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-yellow-500/60" />

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded border-2 border-yellow-500/40 overflow-hidden flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #1a1f2e 0%, #0a0f17 100%)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {avatar ? (
              <img src={avatar} alt={name} className="w-full h-full object-cover pixelated" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">
                🧑‍🎨
              </div>
            )}
          </div>

          {/* Name & Handle */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-bold text-lg tracking-wide uppercase truncate">
                {name}
              </h3>
              {level && (
                <span
                  className="px-1.5 py-0.5 text-[10px] font-bold rounded"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#1a1f2e',
                  }}
                >
                  LV.{level}
                </span>
              )}
            </div>
            {xHandle && (
              <a
                href={xUrl || `https://x.com/${xHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                @{xHandle}
                <ExternalLink size={12} />
              </a>
            )}
            {mood && (
              <div className="text-white/50 text-xs mt-1">
                Mood: {mood}
              </div>
            )}
          </div>

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Bio */}
      {bio && (
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-white/70 text-sm italic">"{bio}"</p>
        </div>
      )}

      {/* Personality Section */}
      {personality.length > 0 && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-500">⭐</span>
            <h4 className="text-white/90 text-xs font-bold uppercase tracking-wider">
              Personality
            </h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {personality.map((trait, i) => (
              <span
                key={i}
                className="px-2 py-1 text-xs rounded"
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#93c5fd',
                }}
              >
                {trait}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hobbies Section */}
      {hobbies.length > 0 && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-500">🎯</span>
            <h4 className="text-white/90 text-xs font-bold uppercase tracking-wider">
              Hobbies
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {hobbies.map((hobby, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 py-1 rounded"
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                <span>{hobby.icon}</span>
                <span className="text-emerald-300 text-xs">{hobby.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Section */}
      {stats && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-500">📊</span>
            <h4 className="text-white/90 text-xs font-bold uppercase tracking-wider">
              Stats
            </h4>
          </div>
          <div className="flex gap-4">
            {stats.followers !== undefined && (
              <div className="text-center">
                <div className="text-white font-bold">{formatNumber(stats.followers)}</div>
                <div className="text-white/40 text-[10px] uppercase">Followers</div>
              </div>
            )}
            {stats.posts !== undefined && (
              <div className="text-center">
                <div className="text-white font-bold">{formatNumber(stats.posts)}</div>
                <div className="text-white/40 text-[10px] uppercase">Posts</div>
              </div>
            )}
            {stats.friends !== undefined && (
              <div className="text-center">
                <div className="text-white font-bold">{formatNumber(stats.friends)}</div>
                <div className="text-white/40 text-[10px] uppercase">Friends</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="px-4 py-3 flex gap-2">
        {xHandle && (
          <a
            href={xUrl || `https://x.com/${xHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded font-medium text-sm transition-all',
              'bg-[#1da1f2]/20 hover:bg-[#1da1f2]/30 text-[#1da1f2] border border-[#1da1f2]/30',
              'hover:scale-[1.02] active:scale-[0.98]',
            )}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Follow on X
          </a>
        )}
        {onChat && (
          <button
            onClick={onChat}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded font-medium text-sm transition-all',
              'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30',
              'hover:scale-[1.02] active:scale-[0.98]',
            )}
          >
            <MessageCircle size={16} />
            Chat
          </button>
        )}
      </div>

      {/* Bottom decorative border */}
      <div
        className="h-1"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #3b82f6 50%, transparent 100%)',
        }}
      />
    </div>
  );
}
