#!/bin/bash

# Resize terrain tiles (128x128) to path tiles (32x32) using Nearest Neighbor
# This preserves pixel-perfect quality for pixel art

INPUT_DIR="public/assets/Tileset Asset/terrain"
OUTPUT_DIR="public/assets/Tileset Asset/paths-from-terrain"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "🎨 Resizing terrain tiles to 32x32 path tiles..."
echo "📁 Input:  $INPUT_DIR"
echo "📁 Output: $OUTPUT_DIR"
echo ""

# Counter for processed files
count=0

# Process all PNG files in terrain folder
for file in "$INPUT_DIR"/*.png; do
    # Get filename without path
    filename=$(basename "$file")

    # Skip if file doesn't exist (empty directory case)
    [ -f "$file" ] || continue

    # Get image dimensions
    dimensions=$(identify -format "%wx%h" "$file" 2>/dev/null)

    # Only process 128x128 images
    if [ "$dimensions" = "128x128" ]; then
        output_file="$OUTPUT_DIR/$filename"

        # Use ImageMagick with Nearest Neighbor (point filter)
        # -filter point = Nearest Neighbor algorithm (no blur/smooth)
        # -resize 32x32 = target size (exactly 1/4 of original)
        convert "$file" -filter point -resize 32x32 "$output_file"

        echo "✅ $filename (128x128 → 32x32)"
        ((count++))
    else
        echo "⏭️  Skipped $filename ($dimensions - not 128x128)"
    fi
done

echo ""
echo "✨ Done! Processed $count images"
echo "📁 Output location: $OUTPUT_DIR"
