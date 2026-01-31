import { ReactNode } from 'react';
import {
  Users,
  UserPlus,
  List,
  Moon,
  Sun,
  Wrench,
  LayoutGrid,
} from 'lucide-react';
import clsx from 'clsx';

type IconButtonProps = {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  isActive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  dataTestId?: string;
};

function IconButton({ icon, label, shortcut, isActive, onClick, disabled, dataTestId }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
      className={clsx(
        'w-10 h-10 flex items-center justify-center rounded-lg transition-all',
        'hover:bg-black/40 hover:scale-110',
        'active:scale-95',
        isActive && 'bg-black/50 ring-2 ring-white/60',
        !isActive && 'bg-black/30',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <div
        className={clsx(
          'w-5 h-5',
          isActive ? 'text-yellow-300' : 'text-white/80',
        )}
      >
        {icon}
      </div>
    </button>
  );
}

type SidebarProps = {
  // Agent section
  onCharactersClick?: () => void;
  onNewAgentClick?: () => void;
  onAgentsClick?: () => void;
  // Tools section
  showTools?: boolean;
  isNight?: boolean;
  onNightToggle?: () => void;
  canToggleNight?: boolean;
  buildMode?: boolean;
  onBuildToggle?: () => void;
  canUseBuildMode?: boolean;
  roomBuildMode?: boolean;
  onRoomBuildToggle?: () => void;
  canUseRoomBuilder?: boolean;
  // Panel content
  children?: ReactNode;
};

export default function Sidebar({
  onCharactersClick,
  onNewAgentClick,
  onAgentsClick,
  showTools = false,
  isNight = false,
  onNightToggle,
  canToggleNight = false,
  buildMode = false,
  onBuildToggle,
  canUseBuildMode = false,
  roomBuildMode = false,
  onRoomBuildToggle,
  canUseRoomBuilder = false,
  children,
}: SidebarProps) {
  const hasAnyTool = canToggleNight || canUseBuildMode || canUseRoomBuilder;
  const hasActivePanel = children && (buildMode || roomBuildMode);

  return (
    <div className="flex h-full pointer-events-none">
      {/* Floating icon strip */}
      <div className="flex flex-col gap-2 p-2 pointer-events-auto">
        {/* Agent icons */}
        <div className="flex flex-col gap-1.5">
          <IconButton
            icon={<Users size={18} />}
            label="Characters"
            onClick={onCharactersClick}
            dataTestId="open-characters"
          />
          <IconButton
            icon={<UserPlus size={18} />}
            label="New Agent"
            onClick={onNewAgentClick}
            dataTestId="open-create-agent"
          />
          <IconButton
            icon={<List size={18} />}
            label="Agents"
            onClick={onAgentsClick}
            dataTestId="open-agent-list"
          />
        </div>

        {/* Divider */}
        {showTools && hasAnyTool && (
          <div className="w-8 mx-auto border-t border-white/20 my-1" />
        )}

        {/* Tool icons */}
        {showTools && hasAnyTool && (
          <div className="flex flex-col gap-1.5">
            {canToggleNight && (
              <IconButton
                icon={isNight ? <Moon size={18} /> : <Sun size={18} />}
                label={isNight ? 'Night Mode' : 'Day Mode'}
                shortcut="N"
                isActive={isNight}
                onClick={onNightToggle}
                dataTestId="toggle-night"
              />
            )}
            {canUseBuildMode && (
              <IconButton
                icon={<Wrench size={18} />}
                label="Build Mode"
                shortcut="B"
                isActive={buildMode}
                onClick={onBuildToggle}
                dataTestId="toggle-build-mode"
              />
            )}
            {canUseRoomBuilder && (
              <IconButton
                icon={<LayoutGrid size={18} />}
                label="Room Builder"
                shortcut="P"
                isActive={roomBuildMode}
                onClick={onRoomBuildToggle}
                dataTestId="toggle-room-builder"
              />
            )}
          </div>
        )}
      </div>

      {/* Slide-out panel (only when a tool is active) */}
      {hasActivePanel && (
        <div
          className="w-64 h-fit max-h-[80vh] bg-slate-900/90 border border-white/20 rounded-lg overflow-auto pointer-events-auto m-2 ml-0"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
