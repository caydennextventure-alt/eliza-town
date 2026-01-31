import { ReactNode } from 'react';
import { Home, RefreshCw, X, LogIn } from 'lucide-react';
import clsx from 'clsx';

type TopBarButtonProps = {
  icon?: ReactNode;
  label: string;
  isActive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  className?: string;
  dataTestId?: string;
};

function TopBarButton({
  icon,
  label,
  isActive,
  isLoading,
  disabled,
  onClick,
  variant = 'default',
  className,
  dataTestId,
}: TopBarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      data-testid={dataTestId}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 text-sm transition-all rounded',
        'hover:bg-white/10',
        isActive && 'bg-white/15 text-white',
        !isActive && 'text-white/70',
        variant === 'danger' && 'hover:bg-red-500/20 hover:text-red-300',
        (disabled || isLoading) && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      <span>{isLoading ? 'Loading...' : label}</span>
    </button>
  );
}

function TopBarDivider() {
  return <div className="w-px h-6 bg-white/20 mx-1" />;
}

function TopBarGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex items-center">
      {label && (
        <span className="text-[10px] text-white/40 uppercase tracking-wider mr-2">{label}</span>
      )}
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

type TopBarProps = {
  // Location
  currentLocation?: 'lobby' | 'room';
  onLobbyClick?: () => void;
  onRoomClick?: () => void;
  lobbyDisabled?: boolean;
  roomLoading?: boolean;
  // Take Over
  isPlaying?: boolean;
  isJoiningOrLeaving?: boolean;
  onTakeOverClick?: () => void;
  // Actions
  onExitClick?: () => void;
  // Login
  showLogin?: boolean;
  onLoginClick?: () => void;
  // Extra content
  children?: ReactNode;
};

export default function TopBar({
  currentLocation = 'lobby',
  onLobbyClick,
  onRoomClick,
  lobbyDisabled,
  roomLoading,
  isPlaying,
  isJoiningOrLeaving,
  onTakeOverClick,
  onExitClick,
  showLogin,
  onLoginClick,
  children,
}: TopBarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 bg-slate-900/85 border-b border-white/10"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-4">
        {/* Location Group */}
        <TopBarGroup>
          <TopBarButton
            icon={<Home size={16} />}
            label="Lobby"
            isActive={currentLocation === 'lobby'}
            onClick={onLobbyClick}
            disabled={lobbyDisabled}
          />
          <TopBarButton
            icon={<Home size={16} />}
            label="My Room"
            isActive={currentLocation === 'room'}
            isLoading={roomLoading}
            onClick={onRoomClick}
          />
        </TopBarGroup>

        <TopBarDivider />

        {/* Take Over */}
        <TopBarGroup>
          <TopBarButton
            icon={<RefreshCw size={16} />}
            label={isPlaying ? 'Release' : 'Take Over'}
            isLoading={isJoiningOrLeaving}
            onClick={onTakeOverClick}
          />
        </TopBarGroup>

        {children && (
          <>
            <TopBarDivider />
            {children}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {showLogin && (
          <TopBarButton
            icon={<LogIn size={16} />}
            label="Login"
            onClick={onLoginClick}
          />
        )}
        <TopBarButton
          icon={<X size={16} />}
          label="Exit"
          variant="danger"
          onClick={onExitClick}
          dataTestId="exit-world"
        />
      </div>
    </div>
  );
}

export { TopBarButton, TopBarDivider, TopBarGroup };
