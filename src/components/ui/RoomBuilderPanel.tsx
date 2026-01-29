import { useState } from 'react';
import { Home, Sofa, Flower2, RotateCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

type PaletteItem = {
  id: string;
  name?: string;
  image?: string;
};

type RoomBuilderPanelProps = {
  category: 'floor' | 'furniture' | 'deco';
  onCategoryChange: (category: 'floor' | 'furniture' | 'deco') => void;
  selectedObjectId: string | null;
  onObjectSelect: (id: string) => void;
  rotation: number;
  onRotate?: () => void;
  onClose?: () => void;
  palette: {
    floor: PaletteItem[];
    furniture: PaletteItem[];
    deco: PaletteItem[];
  };
};

const CATEGORIES = [
  { id: 'floor' as const, label: 'Floor', icon: Home },
  { id: 'furniture' as const, label: 'Furniture', icon: Sofa },
  { id: 'deco' as const, label: 'Deco', icon: Flower2 },
];

const ITEMS_PER_PAGE = 12;

export default function RoomBuilderPanel({
  category,
  onCategoryChange,
  selectedObjectId,
  onObjectSelect,
  rotation,
  onRotate,
  onClose,
  palette,
}: RoomBuilderPanelProps) {
  const [page, setPage] = useState(0);
  const currentPalette = palette[category];
  const totalPages = Math.ceil(currentPalette.length / ITEMS_PER_PAGE);
  const visibleItems = currentPalette.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const selectedItem = selectedObjectId ? currentPalette.find((item) => item.id === selectedObjectId) : null;

  return (
    <div
      className="w-72 h-full flex flex-col border-r border-white/10"
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-white/90 font-medium text-sm tracking-wide">
          Room Builder
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onRotate}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            title={`Rotate (R) - ${rotation}°`}
          >
            <RotateCw size={14} />
          </button>
          <span className="text-white/50 text-xs font-mono">{rotation}°</span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded bg-white/10 hover:bg-red-500/30 text-white/70 hover:text-red-300 transition-colors ml-1"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex border-b border-white/10">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = category === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                onCategoryChange(cat.id);
                setPage(0);
              }}
              className={clsx(
                'flex-1 flex flex-col items-center gap-1 py-2.5 transition-all',
                isActive
                  ? 'bg-white/10 text-white border-b-2 border-blue-400'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/70',
              )}
            >
              <Icon size={18} />
              <span className="text-[9px] font-medium uppercase tracking-wider">
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Item Preview */}
      {selectedItem ? (
        <div className="px-3 py-2.5 bg-white/5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-black/30 border border-white/20 flex items-center justify-center overflow-hidden">
              {selectedItem.image ? (
                <img
                  src={selectedItem.image}
                  alt={selectedItem.name || selectedItem.id}
                  className="max-w-full max-h-full object-contain pixelated"
                />
              ) : (
                <span className="text-white/30 text-xs">?</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/90 text-xs font-medium truncate">
                {selectedItem.name || selectedItem.id}
              </div>
              <div className="text-white/40 text-[10px]">
                Click to place • Shift+Click remove
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2.5 bg-white/5 border-b border-white/10">
          <div className="text-white/40 text-xs text-center">
            Select an item below
          </div>
        </div>
      )}

      {/* Item Grid */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 p-2 overflow-auto">
          {visibleItems.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <span className="text-white/30 text-xs">No items in this category</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {visibleItems.map((item) => {
                const isSelected = selectedObjectId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onObjectSelect(item.id)}
                    title={item.name || item.id}
                    className={clsx(
                      'aspect-square rounded border p-1 transition-all overflow-hidden',
                      'hover:scale-105',
                      'active:scale-95',
                      isSelected
                        ? 'bg-blue-500/20 border-blue-400 ring-1 ring-blue-400/50'
                        : 'bg-black/20 border-white/10 hover:border-white/30 hover:bg-white/5',
                    )}
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name || item.id}
                        className="w-full h-full object-contain pixelated"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-white/40 text-[7px] text-center leading-tight break-all">
                          {(item.name || item.id).slice(0, 10)}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 border-t border-white/10">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={clsx(
                'p-1 rounded transition-colors',
                page === 0
                  ? 'text-white/20 cursor-not-allowed'
                  : 'text-white/60 hover:bg-white/10 hover:text-white',
              )}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-white/50 text-xs font-mono">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={clsx(
                'p-1 rounded transition-colors',
                page >= totalPages - 1
                  ? 'text-white/20 cursor-not-allowed'
                  : 'text-white/60 hover:bg-white/10 hover:text-white',
              )}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-white/10">
        <div className="text-white/30 text-[9px] text-center">
          <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/50">R</kbd> rotate
          {' • '}
          <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/50">Shift</kbd>+Click remove
          {' • '}
          <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/50">Right Click</kbd> remove
        </div>
      </div>
    </div>
  );
}
