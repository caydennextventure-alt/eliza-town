type InteractableTypeOption = {
  id: string;
  label: string;
};

type BuildModePanelProps = {
  selectedObjectInstanceId: string | null;
  selectedObjectId?: string;
  typeDraft: string;
  nameDraft: string;
  radiusDraft: number;
  typeOptions: InteractableTypeOption[];
  onTypeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onRadiusChange: (value: number) => void;
  onSave: () => void;
  onRemove: () => void;
  canRemove: boolean;
};

export default function BuildModePanel({
  selectedObjectInstanceId,
  selectedObjectId,
  typeDraft,
  nameDraft,
  radiusDraft,
  typeOptions,
  onTypeChange,
  onNameChange,
  onRadiusChange,
  onSave,
  onRemove,
  canRemove,
}: BuildModePanelProps) {
  return (
    <div className="p-4 text-white">
      <div className="text-sm font-bold mb-1">Build Mode</div>
      <div className="text-[11px] text-white/60 mb-4">
        Click an object to select (pixel hit-test).
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-white/50 uppercase tracking-wider">
            Selected
          </label>
          <div className="text-[11px] font-mono text-white/80 break-all mt-1">
            {selectedObjectInstanceId ?? '—'}
          </div>
        </div>

        {selectedObjectId && (
          <>
            <div>
              <label className="text-[10px] text-white/50 uppercase tracking-wider">
                Object ID
              </label>
              <div className="text-[11px] font-mono text-white/70 break-all mt-1">
                {selectedObjectId}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">
                Type
              </label>
              <select
                value={typeDraft}
                onChange={(e) => onTypeChange(e.target.value)}
                className="w-full text-xs bg-slate-800 border border-white/20 px-2 py-1.5 rounded text-white"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">
                Display Name
              </label>
              <input
                value={nameDraft}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Optional"
                className="w-full text-xs bg-slate-800 border border-white/20 px-2 py-1.5 rounded text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">
                Interaction Radius
              </label>
              <input
                type="number"
                min={0}
                max={20}
                value={radiusDraft}
                onChange={(e) => onRadiusChange(Number(e.target.value))}
                className="w-full text-xs bg-slate-800 border border-white/20 px-2 py-1.5 rounded text-white"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onSave}
                className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-white transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={!canRemove}
                className={`flex-1 text-xs px-3 py-2 rounded transition-colors ${
                  canRemove
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-slate-700 text-white/40 cursor-not-allowed'
                }`}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
