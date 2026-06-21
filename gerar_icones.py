from PIL import Image, ImageDraw

ROXO = (94, 53, 177, 255)
TEAL = (0, 121, 107, 255)
BRANCO = (255, 255, 255, 255)


def desenhar_icone(tamanho):
    img = Image.new("RGBA", (tamanho, tamanho), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = round(tamanho * 0.06)
    d.rounded_rectangle([pad, pad, tamanho - pad, tamanho - pad],
                         radius=round(tamanho * 0.18), fill=ROXO)

    cx, cy = tamanho / 2, tamanho / 2
    gota_w = tamanho * 0.30
    gota_h = tamanho * 0.46
    top = cy - gota_h * 0.52
    bottom = cy + gota_h * 0.48

    d.polygon([
        (cx, top),
        (cx - gota_w / 2, cy + gota_h * 0.10),
        (cx, bottom),
        (cx + gota_w / 2, cy + gota_h * 0.10),
    ], fill=BRANCO)
    d.ellipse([cx - gota_w / 2, cy - gota_h * 0.06, cx + gota_w / 2, cy + gota_h * 0.42],
              fill=BRANCO)

    r = tamanho * 0.075
    d.ellipse([cx - r, cy + gota_h * 0.06, cx + r, cy + gota_h * 0.06 + r * 2], fill=TEAL)

    return img


for tam in (192, 512):
    icone = desenhar_icone(tam)
    icone.save(f"icons/icon-{tam}.png")

print("Icones gerados.")
