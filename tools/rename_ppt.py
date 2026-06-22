"""替换 PPT 脚本中的旧名称"""
import os
target = os.path.join(os.path.dirname(__file__), 'gen_ppt.py')
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# 逐条替换
content = content.replace('TacticFlow', 'Personal CS Coach')
content = content.replace('Personal CS Coach_答辩PPT.pptx', 'Personal_CS_Coach_答辩PPT.pptx')

with open(target, 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ gen_ppt.py 已更新')