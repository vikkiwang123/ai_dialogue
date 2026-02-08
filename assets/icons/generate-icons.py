#!/usr/bin/env python3
"""
生成浏览器插件图标
需要安装PIL: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("请先安装Pillow: pip install Pillow")
    exit(1)

def create_icon(size):
    """创建指定尺寸的图标"""
    # 创建图像
    img = Image.new('RGB', (size, size), color='#2196f3')
    draw = ImageDraw.Draw(img)
    
    # 绘制对话气泡
    bubble_size = int(size * 0.12)
    draw.ellipse([size * 0.18, size * 0.23, size * 0.18 + bubble_size * 2, size * 0.23 + bubble_size * 2], 
                 fill='white', outline=None)
    draw.ellipse([size * 0.58, size * 0.55, size * 0.58 + bubble_size * 2, size * 0.55 + bubble_size * 2], 
                 fill='white', outline=None)
    
    # 绘制AI文字
    try:
        font_size = int(size * 0.25)
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "AI"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    position = ((size - text_width) / 2, (size - text_height) / 2 - text_height // 4)
    
    draw.text(position, text, fill='white', font=font)
    
    return img

# 生成所有尺寸的图标
sizes = [16, 48, 128]
for size in sizes:
    icon = create_icon(size)
    filename = f'icon{size}.png'
    icon.save(filename)
    print(f'已生成: {filename} ({size}x{size})')

print('\n所有图标已生成完成！')


