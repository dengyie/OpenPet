import cv2
import numpy as np
import os

def smart_split_frames(image_path, output_dir='output_frames_smart'):
    """按行列间距把一张多帧猫图自动切成若干单帧图片。"""

    # 1. 读取图片
    img = cv2.imread(image_path)
    if img is None:
        print("Error: Could not read image.")
        return
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # 2. 移除底部的标题栏
    # 我们从底向上扫描，寻找第一个有内容的行
    # 这里我们使用垂直投影，计算每一行的像素平均值
    row_means = np.mean(gray, axis=1)
    
    # 寻找一个阈值。因为背景是纯灰色(约200)，标题是纯白，文字是黑。
    # 标题栏通常比背景更“亮”（有大量空白）。
    # 这里的策略是寻找连续大片“偏亮”区域的上方边界。
    # 我们反其道而行之：从下往上，寻找第一个连续的“深色”行（属于猫猫或文字）
    
    crop_bottom_y = h
    threshold = 190 # 根据背景色调整，背景约200。小于这个值视为有内容
    
    for y in range(h - 1, 0, -1):
        if np.mean(gray[y, :]) < threshold: # 发现了有内容的一行
            crop_bottom_y = y
            break
    
    # 向下预留几个像素，避免切到最后一行脚的边缘
    crop_bottom_y = min(h, crop_bottom_y + 10)
    
    print(f"检测到标题栏，有效内容截取到 y={crop_bottom_y}")
    cropped_content = gray[0:crop_bottom_y, 0:w]
    cropped_color = img[0:crop_bottom_y, 0:w]
    ch, cw = cropped_content.shape

    # 3. 水平投影检测列边界
    # 对每一列求灰度均值，亮度很高的连续区域通常是帧与帧之间的空白间距。
    col_means = np.mean(cropped_content, axis=0)
    
    # 寻找所有的“间距”（峰值，代表白色背景）
    # 在这里我们寻找那些“很亮”的列
    gap_threshold = 205 # 比背景更亮
    gaps = np.where(col_means > gap_threshold)[0]
    
    # 将连续的 gap 像素归类为同一个间距，避免一个空白区被切成多个边界。
    col_splits = []
    if len(gaps) > 0:
        start = gaps[0]
        for i in range(1, len(gaps)):
            if gaps[i] - gaps[i-1] > 10: # 如果两个 gap 像素不连续，说明是一个新的间距
                col_splits.append((start, gaps[i-1]))
                start = gaps[i]
        col_splits.append((start, gaps[-1])) # 添加最后一个

    # 将间距转换为帧的边界 (x1, x2)。
    # 例如两个空白间距之间的区域就是一列动作帧。
    col_bounds = []
    if not col_splits: # 如果没找到 gap，使用之前的 fallback
        print("未检测到明显列间距，使用 Fallback 方案")
        fw = cw // 8
        col_bounds = [(i*fw, (i+1)*fw) for i in range(8)]
    else:
        # 第一帧
        col_bounds.append((0, col_splits[0][0]))
        # 中间帧
        for i in range(1, len(col_splits)):
            col_bounds.append((col_splits[i-1][1], col_splits[i][0]))
        # 最后一帧
        col_bounds.append((col_splits[-1][1], cw))

    print(f"检测到 {len(col_bounds)} 列")

    # 4. 垂直投影检测行边界
    # 在裁剪后的图像上重复
    # 行检测逻辑和列检测一致：找亮色空白带，再把空白带之间的区域当成帧行。
    row_means_content = np.mean(cropped_content, axis=1)
    
    gaps_row = np.where(row_means_content > gap_threshold)[0]
    
    row_splits = []
    if len(gaps_row) > 0:
        start = gaps_row[0]
        for i in range(1, len(gaps_row)):
            if gaps_row[i] - gaps_row[i-1] > 10: # 行间距通常比较大
                row_splits.append((start, gaps_row[i-1]))
                start = gaps_row[i]
        row_splits.append((start, gaps_row[-1]))

    row_bounds = []
    if not row_splits:
        print("未检测到明显行间距，使用 Fallback 方案")
        fh = ch // 2
        row_bounds = [(0, fh), (fh, ch)]
    else:
        # 第一行
        row_bounds.append((0, row_splits[0][0]))
        # 其他行
        for i in range(1, len(row_splits)):
            row_bounds.append((row_splits[i-1][1], row_splits[i][0]))
        # 最后一行
        row_bounds.append((row_splits[-1][1], ch))

    print(f"检测到 {len(row_bounds)} 行")

    # 5. 执行分割
    # 逐行逐列裁剪帧图，并用 frame_01.jpg、frame_02.jpg 这样的顺序文件名保存。
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    count = 1
    for r_idx, (y1, y2) in enumerate(row_bounds):
        # 每一行检测到的高度范围
        for c_idx, (x1, x2) in enumerate(col_bounds):
            # 每一列检测到的宽度范围
            
            # 确保坐标合法且区域不为零。
            if y2 > y1 and x2 > x1:
                frame = cropped_color[y1:y2, x1:x2]
                
                # 再次确认：如果图片过小，可能是误检的杂质，跳过。
                fh, fw = frame.shape[:2]
                if fh < 100 or fw < 50:
                    continue

                save_path = os.path.join(output_dir, f'frame_{count:02d}.jpg')
                cv2.imwrite(save_path, frame)
                print(f"已保存: {save_path}, 尺寸: {fw}x{fh}")
                count += 1

    print("--- 分割完成 ---")

# 使用脚本
# 将 'your_cat_image.jpg' 替换为你的文件名
# 当前默认处理 bai.png，并把结果放到 cat_anime/frames_smart。
smart_split_frames('./cat_anime/bai.png', output_dir='cat_anime/frames_smart')
