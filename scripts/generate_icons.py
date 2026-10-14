import math
import os
from PIL import Image, ImageDraw, ImageFilter

def create_sharex_logo(size=1024):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    pad = int(size * 0.04)
    radius = int(size * 0.22)
    
    # 1. Dark Glass / Deep Space Squircle Background
    # #0c0d21 to #16173a
    bg = Image.new("RGBA", (size, size))
    for y in range(size):
        ty = y / size
        for x in range(size):
            tx = x / size
            t = (tx + ty) / 2.0
            r = int(12 * (1 - t) + 24 * t)
            g = int(12 * (1 - t) + 22 * t)
            b = int(32 * (1 - t) + 64 * t)
            bg.putpixel((x, y), (r, g, b, 255))
            
    mask = Image.new("L", (size, size), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=255)
    canvas.paste(bg, (0, 0), mask)
    
    # Ambient Radiant Glow (Vivid Indigo & Cyan in Center)
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    cx, cy = size // 2, size // 2
    g_draw.ellipse([cx - int(size*0.40), cy - int(size*0.40), cx + int(size*0.40), cy + int(size*0.40)], fill=(99, 102, 241, 110))
    g_draw.ellipse([cx - int(size*0.26), cy - int(size*0.26), cx + int(size*0.26), cy + int(size*0.26)], fill=(6, 182, 212, 130))
    glow = glow.filter(ImageFilter.GaussianBlur(int(size * 0.12)))
    canvas = Image.alpha_composite(canvas, glow)
    
    # Border / Edge rim with subtle indigo/cyan gradient
    rim_draw = ImageDraw.Draw(canvas)
    rim_draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        outline=(99, 102, 241, 150),
        width=int(size * 0.015)
    )
    rim_draw.rounded_rectangle(
        [pad + int(size*0.01), pad + int(size*0.01), size - pad - int(size*0.01), size - pad - int(size*0.01)],
        radius=radius - int(size*0.01),
        outline=(255, 255, 255, 45),
        width=int(size * 0.006)
    )
    
    # 2. Left-to-Right Diagonal: Transfer Capsule Beam (Top-Left to Bottom-Right)
    beam_w = int(size * 0.16)
    half_w = beam_w // 2
    
    tl = (int(size * 0.22), int(size * 0.22))
    br = (int(size * 0.78), int(size * 0.78))
    
    # Shadow for the beam
    b_shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bs_draw = ImageDraw.Draw(b_shadow)
    bs_offset = int(size * 0.02)
    bs_draw.line([(tl[0] + bs_offset, tl[1] + bs_offset), (br[0] + bs_offset, br[1] + bs_offset)], fill=(0, 0, 0, 200), width=beam_w)
    bs_draw.ellipse([tl[0] + bs_offset - half_w, tl[1] + bs_offset - half_w, tl[0] + bs_offset + half_w, tl[1] + bs_offset + half_w], fill=(0, 0, 0, 200))
    bs_draw.ellipse([br[0] + bs_offset - half_w, br[1] + bs_offset - half_w, br[0] + bs_offset + half_w, br[1] + bs_offset + half_w], fill=(0, 0, 0, 200))
    b_shadow = b_shadow.filter(ImageFilter.GaussianBlur(int(size * 0.03)))
    canvas = Image.alpha_composite(canvas, b_shadow)
    
    # Beam mask
    b_mask = Image.new("L", (size, size), 0)
    bm_draw = ImageDraw.Draw(b_mask)
    bm_draw.line([tl, br], fill=255, width=beam_w)
    bm_draw.ellipse([tl[0] - half_w, tl[1] - half_w, tl[0] + half_w, tl[1] + half_w], fill=255)
    bm_draw.ellipse([br[0] - half_w, br[1] - half_w, br[0] + half_w, br[1] + half_w], fill=255)
    
    # Vibrant gradient: Electric Cyan (#00f2fe) -> Pure Crisp White/Cyan (#e0f2fe) -> Royal Indigo (#6366f1)
    beam_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for y in range(size):
        for x in range(size):
            if b_mask.getpixel((x, y)) > 0:
                t = (x + y) / (2.0 * size)
                if t < 0.5:
                    sub_t = t / 0.5
                    r = int(0 * (1 - sub_t) + 224 * sub_t)
                    g = int(242 * (1 - sub_t) + 248 * sub_t)
                    b = int(254 * (1 - sub_t) + 255 * sub_t)
                else:
                    sub_t = (t - 0.5) / 0.5
                    r = int(224 * (1 - sub_t) + 99 * sub_t)
                    g = int(248 * (1 - sub_t) + 102 * sub_t)
                    b = int(255 * (1 - sub_t) + 241 * sub_t)
                beam_layer.putpixel((x, y), (r, g, b, 255))
                
    canvas = Image.alpha_composite(canvas, beam_layer)
    
    # Connectivity Node rings on beam ends
    n_draw = ImageDraw.Draw(canvas)
    node_r = int(beam_w * 0.28)
    # TL Node
    n_draw.ellipse([tl[0] - node_r, tl[1] - node_r, tl[0] + node_r, tl[1] + node_r], fill=(12, 13, 33, 255))
    n_draw.ellipse([tl[0] - int(node_r*0.55), tl[1] - int(node_r*0.55), tl[0] + int(node_r*0.55), tl[1] + int(node_r*0.55)], fill=(6, 182, 212, 255))
    # BR Node
    n_draw.ellipse([br[0] - node_r, br[1] - node_r, br[0] + node_r, br[1] + node_r], fill=(12, 13, 33, 255))
    n_draw.ellipse([br[0] - int(node_r*0.55), br[1] - int(node_r*0.55), br[0] + int(node_r*0.55), br[1] + int(node_r*0.55)], fill=(99, 102, 241, 255))

    # 3. Crossing Diagonal: Electric Lightning Bolt (Top-Right to Bottom-Left)
    # Balanced, dynamic 90-degree crossing
    bolt_raw = [
        (0.76, 0.20),  # Top-Right tip
        (0.81, 0.25),  # Top-Right edge
        (0.56, 0.48),  # Upper waist notch
        (0.66, 0.49),  # Upper elbow
        (0.24, 0.80),  # Bottom-Left tip
        (0.44, 0.52),  # Lower waist notch
        (0.34, 0.51),  # Lower elbow
    ]
    bolt_pts = [(int(px * size), int(py * size)) for px, py in bolt_raw]
    
    # Bolt Shadow across the beam (creates 3D depth)
    bolt_shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bolt_s_draw = ImageDraw.Draw(bolt_shadow)
    bs_pts = [(x + int(size * 0.022), y + int(size * 0.022)) for x, y in bolt_pts]
    bolt_s_draw.polygon(bs_pts, fill=(0, 0, 0, 220))
    bolt_shadow = bolt_shadow.filter(ImageFilter.GaussianBlur(int(size * 0.035)))
    canvas = Image.alpha_composite(canvas, bolt_shadow)
    
    # Bolt Gradient: Amber Gold to Electric Bright Yellow
    bolt_mask = Image.new("L", (size, size), 0)
    bm_draw = ImageDraw.Draw(bolt_mask)
    bm_draw.polygon(bolt_pts, fill=255)
    
    bolt_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for y in range(size):
        ty = y / size
        # Gold #fbbf24 to Yellow #fef08a to Amber #f59e0b
        r = int(255 * (1 - ty) + 245 * ty)
        g = int(245 * (1 - ty) + 158 * ty)
        b = int(140 * (1 - ty) + 11 * ty)
        for x in range(size):
            if bolt_mask.getpixel((x, y)) > 0:
                bolt_layer.putpixel((x, y), (r, g, b, 255))
                
    canvas = Image.alpha_composite(canvas, bolt_layer)
    
    # White-hot inner core
    core_raw = [
        (0.74, 0.23),
        (0.56, 0.47),
        (0.61, 0.48),
        (0.29, 0.75),
        (0.44, 0.53),
        (0.39, 0.52),
    ]
    core_pts = [(int(px * size), int(py * size)) for px, py in core_raw]
    core_draw = ImageDraw.Draw(canvas)
    core_draw.polygon(core_pts, fill=(255, 255, 255, 240))
    
    return canvas

print("Rendering ShareX logo...")
logo = create_sharex_logo(1024)

out_dir = r"d:\All Project\ShareX\frontend\public"
os.makedirs(out_dir, exist_ok=True)

# Save pwa-512x512.png
img_512 = logo.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(out_dir, "pwa-512x512.png"), "PNG")

# Save pwa-192x192.png
img_192 = logo.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save(os.path.join(out_dir, "pwa-192x192.png"), "PNG")

# Save apple-touch-icon.png
img_180 = logo.resize((180, 180), Image.Resampling.LANCZOS)
img_180.save(os.path.join(out_dir, "apple-touch-icon.png"), "PNG")

# Save favicon.ico (16, 32, 48, 64)
ico_16 = logo.resize((16, 16), Image.Resampling.LANCZOS)
ico_32 = logo.resize((32, 32), Image.Resampling.LANCZOS)
ico_48 = logo.resize((48, 48), Image.Resampling.LANCZOS)
ico_64 = logo.resize((64, 64), Image.Resampling.LANCZOS)
ico_32.save(os.path.join(out_dir, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

print("Saved all icons successfully!")
