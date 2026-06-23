"""移除 gen_ppt.py 中所有截图相关代码"""
import os
target = os.path.join(os.path.dirname(__file__), 'gen_ppt.py')
with open(target, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # 跳过包含截图函数定义和调用的行
    if 'def ss(' in line: continue
    if 'def screenshot_placeholder(' in line: continue
    if 'ss(s,' in line: continue
    if 'screenshot_placeholder(s,' in line: continue
    # 跳过空行周围多余的注释
    new_lines.append(line)

with open(target, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('✅ 截图占位区域已从 gen_ppt.py 中移除')