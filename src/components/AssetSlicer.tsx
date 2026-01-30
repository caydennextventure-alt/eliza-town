
import React, { useState, useRef, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface Slice {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  isSelected: boolean;
}

interface AssetSlicerProps {
  onClose: () => void;
}

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemWritableFileStream = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

type SaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

export const AssetSlicer: React.FC<AssetSlicerProps> = ({ onClose }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [slices, setSlices] = useState<Slice[]>([]);
  const [mode, setMode] = useState<'smart' | 'grid' | 'manual'>('smart');
  
  // View Params
  const [zoom, setZoom] = useState(1);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Smart Mode Params
  const [threshold, setThreshold] = useState(10); // Alpha threshold (0-255)
  const [minSize, setMinSize] = useState(4); // Min dimension
  const [padding, setPadding] = useState(1);
  
  // Grid Mode Params
  const [gridWidth, setGridWidth] = useState(32);
  const [gridHeight, setGridHeight] = useState(32);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [gap, setGap] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualSelection, setManualSelection] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    isDragging: boolean;
  } | null>(null);

  // Load Image
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
          setSlices([]);
          setZoom(1);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const resetAll = () => {
    setImage(null);
    setSlices([]);
    setThreshold(10);
    setMinSize(4);
    setPadding(1);
    setGridWidth(32);
    setGridHeight(32);
    setOffsetX(0);
    setOffsetY(0);
    setGap(0);
    setZoom(1);
  };

  // Draw Canvas & Slices
  useEffect(() => {
    if (!canvasRef.current || !image) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match image
    canvasRef.current.width = image.width;
    canvasRef.current.height = image.height;

    // Draw Image
    ctx.clearRect(0, 0, image.width, image.height);
    ctx.drawImage(image, 0, 0);

    // Draw Overlay
    slices.forEach(slice => {
      if (slice.isSelected) {
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 1;
          ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
      } else {
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
      }
      
      ctx.strokeRect(slice.x, slice.y, slice.w, slice.h);
      ctx.fillRect(slice.x, slice.y, slice.w, slice.h);
    });

    if (manualSelection?.isDragging) {
      const x = Math.min(manualSelection.startX, manualSelection.endX);
      const y = Math.min(manualSelection.startY, manualSelection.endY);
      const w = Math.abs(manualSelection.endX - manualSelection.startX);
      const h = Math.abs(manualSelection.endY - manualSelection.startY);
      ctx.strokeStyle = '#4aa3ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [image, slices, manualSelection]);

  const getCanvasPoint = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width / canvasRef.current.width;
    const scaleY = rect.height / canvasRef.current.height;
    const x = (event.clientX - rect.left) / scaleX;
    const y = (event.clientY - rect.top) / scaleY;
    return { x, y };
  };

  // Handle Canvas Click for Selection
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
     if (!canvasRef.current || !image) return;
     if (mode === 'manual') return;
     const { x, y } = getCanvasPoint(e);

     // Toggle isSelected for any slice containing this point
     const newSlices = slices.map(slice => {
         if (x >= slice.x && x <= slice.x + slice.w && y >= slice.y && y <= slice.y + slice.h) {
             return { ...slice, isSelected: !slice.isSelected };
         }
         return slice;
     });
     setSlices(newSlices);
  };

  const handleCanvasPointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || mode !== 'manual') return;
    const { x, y } = getCanvasPoint(e);
    setManualSelection({ startX: x, startY: y, endX: x, endY: y, isDragging: true });
  };

  const handleCanvasPointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!manualSelection?.isDragging || mode !== 'manual') return;
    const { x, y } = getCanvasPoint(e);
    setManualSelection((prev) =>
      prev ? { ...prev, endX: x, endY: y } : prev,
    );
  };

  const handleCanvasPointerUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!manualSelection?.isDragging || mode !== 'manual' || !image) return;
    const { x, y } = getCanvasPoint(e);
    const startX = manualSelection.startX;
    const startY = manualSelection.startY;
    const endX = x;
    const endY = y;
    const minX = Math.max(0, Math.min(startX, endX));
    const minY = Math.max(0, Math.min(startY, endY));
    const maxX = Math.min(image.width, Math.max(startX, endX));
    const maxY = Math.min(image.height, Math.max(startY, endY));
    const w = Math.round(maxX - minX);
    const h = Math.round(maxY - minY);

    if (!canvasRef.current) {
      setManualSelection(null);
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      setManualSelection(null);
      return;
    }

    const imgData = ctx.getImageData(0, 0, image.width, image.height);
    const data = imgData.data;
    const width = image.width;
    const height = image.height;

    const rectCenterX = minX + w / 2;
    const rectCenterY = minY + h / 2;

    let nearest: { x: number; y: number } | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (let yy = Math.floor(minY); yy < Math.ceil(maxY); yy += 1) {
      for (let xx = Math.floor(minX); xx < Math.ceil(maxX); xx += 1) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const idx = (yy * width + xx) * 4 + 3;
        if (data[idx] > threshold) {
          const dx = xx - rectCenterX;
          const dy = yy - rectCenterY;
          const dist = dx * dx + dy * dy;
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { x: xx, y: yy };
          }
        }
      }
    }

    const addSlice = (sliceX: number, sliceY: number, sliceW: number, sliceH: number) => {
      if (sliceW < 1 || sliceH < 1) return;
      setSlices((prev) => [
        ...prev,
        { x: sliceX, y: sliceY, w: sliceW, h: sliceH, id: `${sliceX}-${sliceY}-${Date.now()}`, isSelected: true },
      ]);
    };

    if (!nearest || w < 1 || h < 1) {
      addSlice(Math.round(minX), Math.round(minY), w, h);
      setManualSelection(null);
      return;
    }

    const visited = new Uint8Array(width * height);
    const stack: Array<[number, number]> = [[nearest.x, nearest.y]];
    let minBX = nearest.x;
    let maxBX = nearest.x;
    let minBY = nearest.y;
    let maxBY = nearest.y;
    visited[nearest.y * width + nearest.x] = 1;

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      if (cx < minBX) minBX = cx;
      if (cx > maxBX) maxBX = cx;
      if (cy < minBY) minBY = cy;
      if (cy > maxBY) maxBY = cy;

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (visited[nIdx]) continue;
        const alpha = data[nIdx * 4 + 3];
        if (alpha > threshold) {
          visited[nIdx] = 1;
          stack.push([nx, ny]);
        }
      }
    }

    const baseW = maxBX - minBX + 1;
    const baseH = maxBY - minBY + 1;
    const px = Math.max(0, minBX - padding);
    const py = Math.max(0, minBY - padding);
    const pw = Math.min(width - px, baseW + padding * 2);
    const ph = Math.min(height - py, baseH + padding * 2);

    addSlice(px, py, pw, ph);
    setManualSelection(null);
  };

  // Algorithms
  const detectAssets = useCallback(() => {
    if (!canvasRef.current || !image) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // We must redraw original image to get clear pixel data without overlays
    ctx.clearRect(0, 0, image.width, image.height);
    ctx.drawImage(image, 0, 0);

    if (mode === 'grid') {
      const newSlices: Slice[] = [];
      for (let y = offsetY; y < image.height; y += gridHeight + gap) {
        for (let x = offsetX; x < image.width; x += gridWidth + gap) {
          if (x + gridWidth <= image.width && y + gridHeight <= image.height) {
             newSlices.push({ x, y, w: gridWidth, h: gridHeight, id: `${x}-${y}`, isSelected: true });
          }
        }
      }
      setSlices(newSlices);
    } else {
      // Smart Detection (Flood Fill / Connected Components)
      const w = image.width;
      const h = image.height;
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const visited = new Uint8Array(w * h);
      const newSlices: Slice[] = [];

      const getIdx = (x: number, y: number) => (y * w + x);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = getIdx(x, y);
          if (visited[idx]) continue;

          const alpha = data[idx * 4 + 3];
          if (alpha > threshold) {
            // Found new object, flood fill
            let minX = x, maxX = x, minY = y, maxY = y;
            const stack = [[x, y]];
            visited[idx] = 1;

            while (stack.length > 0) {
              const [cx, cy] = stack.pop()!;
              
              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;

              // Check neighbors (4-way)
              const neighbors = [
                [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
              ];

              for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const nIdx = getIdx(nx, ny);
                  if (!visited[nIdx]) {
                    const nAlpha = data[nIdx * 4 + 3];
                    if (nAlpha > threshold) {
                      visited[nIdx] = 1;
                      stack.push([nx, ny]);
                    }
                  }
                }
              }
            }

            // Object bounds found
            const width = maxX - minX + 1;
            const height = maxY - minY + 1;

            if (width >= minSize && height >= minSize) {
                // Apply padding
                const px = Math.max(0, minX - padding);
                const py = Math.max(0, minY - padding);
                const pw = Math.min(w - px, width + padding * 2);
                const ph = Math.min(h - py, height + padding * 2);

                newSlices.push({
                    x: px,
                    y: py,
                    w: pw,
                    h: ph,
                    id: `${px}-${py}`,
                    isSelected: true
                });
            }
          }
        }
      }
      setSlices(newSlices);
    }
  }, [image, mode, threshold, minSize, padding, gridWidth, gridHeight, offsetX, offsetY, gap]);

  // Export
  const handleExport = async () => {
    if (!image || !canvasRef.current || slices.length === 0) return;
    const zip = new JSZip();
    const selectedSlices = slices.filter(s => s.isSelected);
    
    if (selectedSlices.length === 0) {
        alert("No assets selected! Click on green boxes to select them.");
        return;
    }

    // Load fresh image to avoid capturing overlay
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    let count = 0;
    const folder = zip.folder("slices");

    for (const slice of selectedSlices) {
        tempCanvas.width = slice.w;
        tempCanvas.height = slice.h;
        tempCtx.clearRect(0, 0, slice.w, slice.h);
        tempCtx.drawImage(image, slice.x, slice.y, slice.w, slice.h, 0, 0, slice.w, slice.h);
        
        const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        if (blob && folder) {
            folder.file(`asset_${count}.png`, blob);
            count++;
        }
    }

    const content = await zip.generateAsync({ type: "blob" });
    
    // Try Native File System Access API first (Fixes renaming issues)
    try {
        const savePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
        if (typeof savePicker === 'function') {
            const handle = await savePicker({
                suggestedName: 'assets.zip',
                types: [{
                    description: 'ZIP Archive',
                    accept: { 'application/zip': ['.zip'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return;
        }
    } catch (err: any) {
        // Fallback if user cancels or API fails
        if (err.name !== 'AbortError') {
             console.error("Native save failed, falling back to download", err);
        } else {
             return; // User cancelled
        }
    }

    // Fallback to legacy download
    saveAs(content, "assets.zip");
  };

  const selectedCount = slices.filter(s => s.isSelected).length;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6 font-sans">
      <div className="bg-[#1e1e1e] rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex overflow-hidden border border-[#555]">
        
        {/* Left Sidebar: Controls */}
        <div className="w-80 bg-[#2d2d2d] flex flex-col border-r border-[#444] text-sm text-[#ddd]">
            <div className="p-4 border-b border-[#444] flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Asset Slicer</h2>
                 <button onClick={resetAll} className="text-xs text-[#aaa] hover:text-white px-2 py-1 rounded bg-[#333] border border-[#555]">
                    Reset
                 </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-6">
                <div className="space-y-3">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 bg-[#e67e22] hover:bg-[#d35400] text-white rounded font-bold shadow transition-all uppercase tracking-wide"
                    >
                        {image ? "Change Image" : "Upload Image"}
                    </button>
                    <input 
                        ref={fileInputRef} 
                        type="file" 
                        onChange={handleFileChange} 
                        className="hidden" 
                        accept="image/png, image/jpeg" 
                    />
                </div>

                {image && (
                    <>
                        <div className="space-y-2">
                            <label className="text-[#888] text-xs font-bold uppercase tracking-wider block">Mode</label>
                            <div className="flex bg-[#111] p-1 rounded">
                                <button 
                                    onClick={() => setMode('smart')}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${mode === 'smart' ? 'bg-[#444] text-white' : 'text-[#666] hover:text-[#999]'}`}
                                >
                                    Smart Detect
                                </button>
                                <button 
                                    onClick={() => setMode('grid')}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${mode === 'grid' ? 'bg-[#444] text-white' : 'text-[#666] hover:text-[#999]'}`}
                                >
                                    Grid Split
                                </button>
                                <button
                                    onClick={() => setMode('manual')}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${mode === 'manual' ? 'bg-[#444] text-white' : 'text-[#666] hover:text-[#999]'}`}
                                >
                                    Manual
                                </button>
                            </div>
                            <p className="text-[10px] text-[#777] leading-tight">
                                {mode === 'smart' 
                                    ? "Automatically finds object boundaries using pixel transparency (Flood Fill)."
                                    : mode === 'grid'
                                      ? "Slices image into a fixed-size grid. Ideal for tilesets."
                                      : "Draw rectangles directly on the image to add slices."}
                            </p>
                        </div>

                        {mode === 'smart' ? (
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <div className="flex justify-between">
                                        <label className="text-[#ccc] text-xs">Alpha Threshold</label>
                                        <span className="text-[#888] text-xs">{threshold}</span>
                                    </div>
                                    <input type="range" min="0" max="255" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-full accent-[#e67e22]" />
                                    <p className="text-[10px] text-[#666]">Ignore pixels with transparency lower than this value.</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between">
                                        <label className="text-[#ccc] text-xs">Min Size</label>
                                        <span className="text-[#888] text-xs">{minSize}px</span>
                                    </div>
                                    <input type="range" min="1" max="100" value={minSize} onChange={e => setMinSize(Number(e.target.value))} className="w-full accent-[#e67e22]" />
                                    <p className="text-[10px] text-[#666]">Ignore detected areas smaller than this.</p>
                                </div>
                                <div className="space-y-1">
                                     <div className="flex justify-between">
                                        <label className="text-[#ccc] text-xs">Padding</label>
                                        <span className="text-[#888] text-xs">{padding}px</span>
                                    </div>
                                    <input type="range" min="0" max="20" value={padding} onChange={e => setPadding(Number(e.target.value))} className="w-full accent-[#e67e22]" />
                                    <p className="text-[10px] text-[#666]">Add extra space around cropped items.</p>
                                </div>
                            </div>
                        ) : mode === 'grid' ? (
                             <div className="space-y-3">
                                <div className="flex gap-2">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[#ccc] text-xs block">Width (px)</label>
                                        <input type="number" value={gridWidth} onChange={e => setGridWidth(Number(e.target.value))} className="w-full bg-[#111] text-white px-2 py-1 rounded border border-[#444] text-xs" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[#ccc] text-xs block">Height (px)</label>
                                        <input type="number" value={gridHeight} onChange={e => setGridHeight(Number(e.target.value))} className="w-full bg-[#111] text-white px-2 py-1 rounded border border-[#444] text-xs" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[#ccc] text-xs block mb-1">Offset (X / Y)</label>
                                    <div className="flex gap-2">
                                        <input type="number" value={offsetX} onChange={e => setOffsetX(Number(e.target.value))} className="w-full bg-[#111] text-white px-2 py-1 rounded border border-[#444] text-xs" />
                                        <input type="number" value={offsetY} onChange={e => setOffsetY(Number(e.target.value))} className="w-full bg-[#111] text-white px-2 py-1 rounded border border-[#444] text-xs" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[#ccc] text-xs block mb-1">Gap</label>
                                    <input type="number" value={gap} onChange={e => setGap(Number(e.target.value))} className="w-full bg-[#111] text-white px-2 py-1 rounded border border-[#444] text-xs" />
                                </div>
                                <p className="text-[10px] text-[#666]">Adjust grid size and start position to align with your tileset.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-[10px] text-[#777] leading-tight">
                                    Drag on the image to create a slice. Click existing slices to toggle selection.
                                </p>
                            </div>
                        )}
                        
                        <div className="pt-2">
                             <button 
                                onClick={detectAssets}
                                className="w-full py-2 bg-[#3498db] hover:bg-[#2980b9] text-white rounded font-semibold text-xs transition-all tracking-wide"
                            >
                                Preview Slices
                            </button>
                        </div>
                    </>
                )}
            </div>

            {image && (
                 <div className="p-4 bg-[#252525] border-t border-[#444]">
                     <div className="flex justify-between items-center mb-2 text-xs text-[#999]">
                        <span>Found: {slices.length}</span>
                        <span>Selected: {selectedCount}</span>
                     </div>
                    <button 
                        onClick={handleExport}
                        disabled={selectedCount === 0}
                        className="w-full py-3 bg-[#2ecc71] hover:bg-[#27ae60] disabled:bg-[#444] disabled:text-[#666] disabled:cursor-not-allowed text-white rounded font-bold shadow flex items-center justify-center gap-2"
                    >
                        <span>Download ZIP</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                    <p className="text-[10px] text-[#666] text-center mt-2">Click items in view to toggle selection.</p>
                </div>
            )}

            <button onClick={onClose} className="p-3 text-center text-[#666] hover:text-white border-t border-[#444] text-xs">
                Back to Editor
            </button>
        </div>

        {/* Right Area: Canvas Preview */}
        <div className="flex-1 bg-[#151515] relative overflow-hidden flex flex-col">
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                 <button onClick={() => setZoom(z => Math.min(z + 0.5, 5))} className="w-8 h-8 flex items-center justify-center bg-[#333] hover:bg-[#444] text-white rounded shadow text-lg border border-[#555]">+</button>
                 <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))} className="w-8 h-8 flex items-center justify-center bg-[#333] hover:bg-[#444] text-white rounded shadow text-lg border border-[#555]">-</button>
                 <div className="bg-[#333] text-[10px] text-center text-[#aaa] rounded py-1 px-1 border border-[#555]">{(zoom * 100).toFixed(0)}%</div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[url('/assets/bg_pattern.png')] custom-scrollbar" ref={canvasContainerRef}>
                {!image ? (
                    <div className="text-center text-[#555]">
                        <p className="text-xl mb-2 font-light">No Image Loaded</p>
                        <p className="text-sm">Upload a spritesheet to begin slicing</p>
                    </div>
                ) : (
                    <canvas 
                        ref={canvasRef} 
                        onClick={handleCanvasClick}
                        onMouseDown={handleCanvasPointerDown}
                        onMouseMove={handleCanvasPointerMove}
                        onMouseUp={handleCanvasPointerUp}
                        onMouseLeave={() => mode === 'manual' && setManualSelection(null)}
                        className={`shadow-2xl border border-[#333] transition-transform duration-200 ${mode === 'manual' ? 'cursor-crosshair' : 'cursor-pointer'}`}
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} 
                    />
                )}
            </div>
            
            <div className="py-1 px-4 bg-[#252525] border-t border-[#444] text-[10px] text-[#666] flex justify-between">
                <span>Hold shift + scroll to zoom (coming soon)</span>
                <span>Green = Selected | Red = Deselected</span>
            </div>
        </div>
      </div>
    </div>
  );
};
