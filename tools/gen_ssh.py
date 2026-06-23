"""生成 Ed25519 SSH Key 并打印公钥"""
import os, subprocess

keyfile = r"C:\Users\20317\.ssh\id_ed25519"
if os.path.exists(keyfile):
    print("SSH Key 已存在，跳过生成")
else:
    subprocess.run(["ssh-keygen", "-t", "ed25519", "-C", "s1nnerfps@github", "-f", keyfile, "-N", ""], check=True)
    print("✅ SSH Key 已生成")

# 打印公钥
with open(keyfile + ".pub") as f:
    pubkey = f.read().strip()
print("\n========== SSH 公钥（复制下面整段到 GitHub）==========")
print(pubkey)
print("========================================================")