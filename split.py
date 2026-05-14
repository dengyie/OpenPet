import cv2
import numpy as np
import os

# 这个脚本用于把一张动作合成图切成单帧图片。
# 它依赖 OpenCV 的轮廓检测：先把白色背景和猫图区分开，再根据每个猫图轮廓裁剪。
input_path = "cat_anime/bow.png"
output_dir = "frames_final"

# 确保输出目录存在；exist_ok=True 可以重复运行脚本而不报错。
os.makedirs(output_dir, exist_ok=True)

# 读取图片
img = cv2.imread(input_path)
if img is None:
    raise ValueError("图片路径错误")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# 1. 二值化（稍微放宽，保证猫完整）
# 白色背景会被压到 0，猫和较深内容会变成 255，方便后续找轮廓。
_, thresh = cv2.threshold(gray, 235, 255, cv2.THRESH_BINARY_INV)

# 2. 腐蚀，强制断开相邻帧之间可能粘在一起的边缘。
kernel = np.ones((5, 5), np.uint8)
thresh = cv2.erode(thresh, kernel, iterations=2)

# 腐蚀会让主体略微变小，所以再膨胀一次，尽量恢复猫图外形。
thresh = cv2.dilate(thresh, kernel, iterations=1)

# 3. 找外部轮廓。RETR_EXTERNAL 只保留最外层轮廓，避免眼睛、花纹等内部细节被当成单独目标。
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

boxes = []

# 4. 过滤合理区域，只保留面积足够大的候选帧。
for cnt in contours:
    x, y, w, h = cv2.boundingRect(cnt)
    area = w * h

    # 过滤太小噪声，避免把文字、碎边或孤立像素保存成帧。
    if area < 20000:
        continue

    boxes.append((x, y, w, h))

# 5. 排序（从上到下，从左到右），让输出帧顺序符合动画播放顺序。
boxes = sorted(boxes, key=lambda b: (b[1] // 100, b[0]))

print(f"检测到 {len(boxes)} 个目标")

# 6. 裁剪 + 精细去边。第一次裁剪按轮廓框，第二次裁剪去掉框内残留白边。
for i, (x, y, w, h) in enumerate(boxes, 1):
    sub = img[y:y+h, x:x+w]

    # 再做一次精细去白边，让单帧图片尽量贴合主体。
    gray_sub = cv2.cvtColor(sub, cv2.COLOR_BGR2GRAY)
    _, th = cv2.threshold(gray_sub, 240, 255, cv2.THRESH_BINARY_INV)

    coords = cv2.findNonZero(th)
    if coords is not None:
        x2, y2, w2, h2 = cv2.boundingRect(coords)
        sub = sub[y2:y2+h2, x2:x2+w2]

    out_path = os.path.join(output_dir, f"{i:02d}.png")
    cv2.imwrite(out_path, sub)

    print("Saved:", out_path)

print("✅ 完成")
