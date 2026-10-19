## TEST AGENT PROMPT – IMAGE INTEGRATION RULES ##
- Always use base64-encoded images for all tests and requests.
- Accepted formats: JPEG, PNG, WEBP only. No SVG/BMP/HEIC.
- Do not upload blank or solid-color images; images must contain real features.
- Re-detect and update MIME after any conversion.
- Animated images: first frame only.
- Resize large images to reasonable bounds.
- RoomFit test floor plan: /app/tests/sample_floorplan.png (1B1B: bedroom left, living right, balcony top, kitchen lower right, bath, walk-in closet).
