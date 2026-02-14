You only need to design two (or three) high-resolution PNG files. Save these in your project's assets/ or assets/images/ folder.

    icon.png (For iOS and general fallback):

        Size: 1024x1024 pixels.

        Format: PNG.

        Rule: NO transparency. The background must be a solid color.

    adaptive-icon.png (For Android Foreground):

        Size: 1024x1024 pixels.

        Format: PNG.

        Rule: Must have a transparent background. * Important: Your logo needs to be scaled down to fit within the center "safe zone".  If your logo stretches to the edges, Android will chop it off when it applies its circle/squircle masks.

(Optional) adaptive-background.png: If your Android background is a complex gradient or pattern, create a 1024x1024 PNG for it. If your background is just a solid color, you don't need this file.
