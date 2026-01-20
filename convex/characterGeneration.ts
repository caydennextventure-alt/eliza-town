import { v } from 'convex/values';
import { action } from './_generated/server';
import { api } from './_generated/api';
import Replicate from 'replicate';

export const generate = action({
  args: {
    prompt: v.string(),
    image: v.optional(v.string()), // Base64 string of the reference image
  },
  handler: async (ctx, args) => {
    // 1. Validate Credentials
    // User referred to Gemini/Imagen as "nanobanana", so we check both for flexibility.
    const googleApiKey = process.env.GOOGLE_API_KEY || process.env.NANOBANANA_API_KEY; 
    const replicateToken = process.env.REPLICATE_API_TOKEN;

    console.log("Checking Environment Variables:");
    console.log("GOOGLE_API_KEY exists:", !!process.env.GOOGLE_API_KEY);
    console.log("NANOBANANA_API_KEY exists:", !!process.env.NANOBANANA_API_KEY);
    console.log("REPLICATE_API_TOKEN exists:", !!process.env.REPLICATE_API_TOKEN);

    if (!googleApiKey || !replicateToken) {
      throw new Error("Missing API Keys: Please set GOOGLE_API_KEY (or NANOBANANA_API_KEY) and REPLICATE_API_TOKEN.");
    }

    let finalPrompt = args.prompt;

    // --- Step 0: Describe Image (if provided) ---
    if (args.image) {
        console.log("Analyzing uploaded reference image...");
        try {
            // Remove header if present (e.g. "data:image/png;base64,")
            const base64Image = args.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
            
            const visionResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key=${googleApiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Describe this character's appearance in detail for a sprite sheet generation prompt. Focus on clothing, colors, hair, and key features. Keep it concise." },
                            { inline_data: { mime_type: "image/png", data: base64Image } }
                        ]
                    }]
                })
            });
            
            if (!visionResponse.ok) {
                 console.warn(`Vision API warning: ${await visionResponse.text()}`);
            } else {
                const visionData = await visionResponse.json();
                const description = visionData.candidates?.[0]?.content?.parts?.[0]?.text;
                if (description) {
                    console.log("Refined prompt with image description:", description);
                    finalPrompt = `${args.prompt || "A character"} inspired by: ${description}`;
                }
            }
        } catch (e) {
            console.error("Failed to analyze image, reusing original prompt", e);
        }
    }

    console.log(`Step 1: Generating Sprite Sheet with prompt: ${finalPrompt}`);

    // --- Step 1: Generate Sprite Sheet (Nano Banana Pro / gemini-3-pro-image-preview) ---
    // User requested "nanobanana pro (gemini-3-pro-image-preview)" via generateContent
    // Using configuration from: https://ai.google.dev/gemini-api/docs/image-generation#rest
    // Verified working via curl with: responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: "1K" }
    
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleApiKey}`;
    
    // Construct the payload parts
    const parts: any[] = [
        { text: `Design a pixel art sprite sheet based on the uploaded reference image.
        Context: ${finalPrompt}.
        Instructions:
        1. Extract character features from the reference image.
        2. Strictly follow the classic Stardew Valley walking sprite layout.
        3. Layout (4 Rows x 3 Columns):
           - Row 1: Front View (Walking Down/Facing Camera)
           - Row 2: Left Side View (Walking Left) -> MUST look to the LEFT.
           - Row 3: Right Side View (Walking Right) -> MUST look to the RIGHT.
           - Row 4: Back View (Walking Up/Facing Away)
        4. CRITICAL: Row 2 and Row 3 must be OPPOSITE directions. One looks Left, one looks Right. Do not make them identical.
        5. Maintain balanced character proportions.
        6. Keep the image sharp, clear, and pixel-perfect.
        7. Total frames: Exactly 12 frames (4 rows × 3 columns). No more, no less.
        8. Output: ONLY the sprite sheet image.` }
    ];

    // If a reference image is provided, add it to the generation request (Multimodal)
    if (args.image) {
        // Ensure clean base64
        const base64Image = args.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
        parts.push({
            inlineData: {
                mimeType: "image/png", // defaulting to png, or we could detect
                data: base64Image
            }
        });
        console.log("Adding reference image to Gemini 3 Pro input...");
    }

    console.log(`Step 1: Generating with gemini-3-pro-image-preview (Strict Image Mode, Query Auth, Multimodal)...`);
    
    const geminiResponse = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ["IMAGE"], // Strict image output
                imageConfig: {
                    aspectRatio: "3:4",
                    imageSize: "1K"
                }
            }
        })
    });

    if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.warn(`Gemini 3 Pro Generation failed (${geminiResponse.status}): ${errorText}`);
        throw new Error(`Gemini 3 Pro Generation Failed: ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    console.log("Gemini 3 Pro Response received.");
    
    // Parse response for inline image data
    let generatedBase64 = null;
    
    // Check for inline image data in candidates
    if (geminiData.candidates?.[0]?.content?.parts) {
        for (const part of geminiData.candidates[0].content.parts) {
             // API returns camelCase 'inlineData' in raw JSON fetch response
             if (part.inlineData && part.inlineData.data) {
                generatedBase64 = part.inlineData.data;
                console.log("Found image data in 'inlineData'");
                break;
            }
            // Fallback for snake_case if API behavior changes
            if (part.inline_data && part.inline_data.data) {
                generatedBase64 = part.inline_data.data;
                console.log("Found image data in 'inline_data'");
                break;
            }
        }
    }
    
    if (!generatedBase64) {
        console.log("Full Gemini Response:", JSON.stringify(geminiData, null, 2));
        throw new Error("Gemini 3 Pro returned successfully but contained no inline image data.");
    }
    
    const generatedImageUri = `data:image/png;base64,${generatedBase64}`;

    
    // --- Step 2: Remove Background (Replicate: 851-labs/background-remover) ---
    console.log("Step 2: Removing background via Replicate...");
    const replicate = new Replicate({ auth: replicateToken });
    
    const output = await replicate.run("851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc" as any, {
      input: {
        image: generatedImageUri,
        format: "png",
        background_type: "rgba" // Transparent
      }
    });

    // Output is usually a string URL
    const cleanImageUrl = String(output);
    console.log("Step 2 Success:", cleanImageUrl);

    // --- Step 2.5: Resize to standard 96x128 (using wsrv.nl) ---
    console.log("Step 2.5: Resizing to 96x128...");
    const resizeUrl = `https://wsrv.nl/?url=${encodeURIComponent(cleanImageUrl)}&w=96&h=128&fit=cover&output=png`;
    const resizedResponse = await fetch(resizeUrl);
    
    if (!resizedResponse.ok) {
      console.warn("Resize failed, falling back to original image");
      // Fallback to original if resize fails
    }
    
    const finalImageBlob = resizedResponse.ok 
      ? await resizedResponse.blob() 
      : await (await fetch(cleanImageUrl)).blob();
    
    console.log("Step 2.5 Complete: Image resized to 96x128");

    // --- Step 3: Save to Convex Storage ---
    console.log("Step 3: Saving to storage...");
    console.log("Step 3.1: Getting upload URL...");

    // 1. Generate Upload URL
    const uploadUrl = await ctx.runMutation(api.characterSprites.generateUploadUrl);
    console.log("Step 3.2: Upload URL obtained, uploading blob...");
    console.log("Blob size:", finalImageBlob.size, "bytes, type:", finalImageBlob.type);
    
    // 2. Upload
    const uploadResult = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": finalImageBlob.type },
      body: finalImageBlob,
    });

    console.log("Step 3.3: Upload complete, status:", uploadResult.status);

    if (!uploadResult.ok) {
      throw new Error(`Failed to upload to Convex storage: ${await uploadResult.text()}`);
    }
    
    const { storageId } = await uploadResult.json();
    console.log("Step 3.4: Storage ID obtained:", storageId);
    
    // Return the storageId
    return { storageId };
  },
});

export const generateCharacterConcept = action({
  args: { 
    prompt: v.string(),
    image: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    // 0. Check API Keys
    const googleApiKey = process.env.GOOGLE_API_KEY || process.env.NANOBANANA_API_KEY; 
    const replicateToken = process.env.REPLICATE_API_TOKEN;

    if (!googleApiKey || !replicateToken) {
        throw new Error("Missing API Keys");
    }

    let finalPrompt = args.prompt;
    
    // Construct parts array for the request
    const parts: any[] = [{ 
        text: `Generate a pixel art character, full body front view. 
                Context: ${finalPrompt}.
                Requirements:
                - Pixel art style
                - Full body front view
                - White background` 
    }];

    // 1. If Image Provided, pass it directly to the model (Nanobanana Pro supports multimodal input)
    if (args.image) {
        console.log("Using reference image directly for generation...");
        // Extract MIME type and Base64 data
        const mimeMatch = args.image.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        const base64Image = args.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
        
        parts.push({
            inline_data: { mime_type: mimeType, data: base64Image }
        });
    }

    // 2. Generate PFP with Gemini
    console.log("Generating PFP Concept...");
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleApiKey}`;
    
    const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts }]
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API Error: ${response.statusText}`);
    }

    const geminiData = await response.json();
    const generatedBase64 = geminiData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? 
                          geminiData.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data;

    if (!generatedBase64) {
        throw new Error("No image data returned from Gemini");
    }

    // 3. Remove Background
    const replicate = new Replicate({ auth: replicateToken });
    const output = await replicate.run("851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc" as any, {
        input: {
            image: `data:image/png;base64,${generatedBase64}`,
            format: "png",
            background_type: "rgba"
        }
    });

    return { imageUrl: String(output) };
  }
});
