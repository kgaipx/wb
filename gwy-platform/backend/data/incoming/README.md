# 题库导入暂存区 (incoming)

把从百度网盘下载的题库文件（**Word `.docx` 或 PDF `.pdf`**）放到本目录，然后让 WorkBuddy 运行导入：

```bash
cd backend
python scripts/ingest.py                 # 先预览解析结果(JSON)，确认字段映射
python scripts/ingest.py --import        # 确认无误后写入数据库
# 可选：覆盖科目/细分、限定扩展名
python scripts/ingest.py --subject 行测 --category 言语理解与表达
python scripts/ingest.py --include pdf   # 仅处理 PDF
```

- 本目录内容已被 `.gitignore` 忽略，不会误提交你的第三方资料。
- 导入默认 `is_verified=False`、`source=文件名`、`copyright_owner="导入-待核实"`，上线前需做版权合规校验与双签。
- 解析支持：单选 / 多选（答案行支持 `A、B、C` / `A,B,C` / `AB`）/ 申论；按题干去重、幂等可重跑。
