import os
from PIL import Image, ImageDraw

def smarter_remove_bg(img_path, output_path):
    print(f"Smarter processing {img_path}...")
    img = Image.open(img_path).convert("RGBA")
    width, height = img.size
    
    # Create a mask for the background
    # We'll use floodfill from the four corners
    mask = Image.new("L", (width, height), 0)
    
    # White background threshold: we consider anything > 240 as "white" for floodfill
    # But since PIL's floodfill uses exact colors, we might need to pre-process or use a threshold.
    # Let's simplify: any pixel that is very white will be candidate.
    
    # To handle "mostly white" but not pure white, we can temporarily posterize or threshold
    temp_img = img.convert("L")
    # Turn everything > 245 to pure white (255), rest to black (0)
    bw_mask = temp_img.point(lambda p: 255 if p > 245 else 0)
    
    # Now floodfill the background on our mask using the black/white guide
    # We floodfill starting from corners on the 'bw_mask'
    for x, y in [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]:
        ImageDraw.floodfill(bw_mask, (x, y), 127) # 127 is our "seed" for background
    
    # Now pixels with value 127 in bw_mask are background
    data = img.getdata()
    mask_data = bw_mask.getdata()
    
    new_data = []
    for i in range(len(data)):
        if mask_data[i] == 127:
            new_data.append((255, 255, 255, 0)) # Transparent
        else:
            new_data.append(data[i])
            
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Saved to {output_path}")

assets_dir = "/Users/junseungmo/Documents/03_Resources/repos/inline-game/public/assets"
assets = ["player_default.png", "player_skins.png", "obs_assets.png", "item_assets.png", "coin.png", "shield.png", "slowmo.png", "mine.png", "blade.png"]

for asset in assets:
    path = os.path.join(assets_dir, asset)
    if os.path.exists(path):
        smarter_remove_bg(path, path)
    else:
        print(f"File not found: {path}")
