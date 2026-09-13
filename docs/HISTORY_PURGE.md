# Git history purge for protected assessment materials

当前工作树已经删除公开操作者表格，并把 HVLT / MSCEIT 等受保护内容改为本地私有配置或合成刺激。但普通 `git rm` / GitHub Contents API 删除**不会从历史 commit 清除旧 blob**。

如果历史中曾提交过不应公开再分发的测试材料，应把 history purge 作为独立的仓库安全操作处理。

## 已知需要检查的旧路径

```text
docs/7.简版MCCB操作者表格（A）_vlm.txt
docs/8.简版MCCB操作者表格（B）_vlm.txt
```

还应检查历史版本的任务页是否曾包含固定词表、正式题目、答案键或评分权重。

## 推荐流程

1. 先创建离线镜像备份并冻结仓库写入。
2. 确认哪些历史路径/blob 确实需要清除，以及你是否拥有保留/再分发它们的权利。
3. 使用 `git filter-repo`（或等效历史重写工具）从所有 refs 删除对应路径/内容。
4. 本地检查所有 branches/tags，确认目标文本或 blob 不再可达。
5. force-push 重写后的 refs。
6. 通知所有协作者重新 clone；旧 clone 不应再推回原历史。
7. 若材料具有真实 test-security / 法律敏感性，按 GitHub 的 sensitive-data removal 流程处理缓存/PR refs 等仍可能保留的对象。

示意命令（请在备份仓库中根据实际路径审查后再执行）：

```bash
git filter-repo \
  --path 'docs/7.简版MCCB操作者表格（A）_vlm.txt' \
  --path 'docs/8.简版MCCB操作者表格（B）_vlm.txt' \
  --invert-paths
```

## 为什么本 PR 不直接做 history rewrite

本 PR 只修改当前分支内容。历史重写会改变大量 commit SHA、branches/tags，并可能破坏协作者现有 clone，因此不应由普通文件更新 API 隐式执行。

在 history purge 完成前，正确的表述是：**当前公开工作树已清理；历史 exposure 尚需单独处置。**
