---
name: verify-dod
description: 运行 DoD 三件套验证（typecheck + lint + test），在提交前或功能完成后确认代码门全绿。用 /verify-dod 触发。
---

# verify-dod

运行本仓库的"Definition of Done"自动化验证三件套，快速确认改动是否可提交。

## 执行步骤

按顺序运行，任一步骤失败立即停止并报告，不要继续后续步骤：

1. **类型检查**: `pnpm -r typecheck`
2. **Lint**: `pnpm lint`
3. **单测**: `pnpm -r test`

## 输出要求

- 每步附上实际命令输出尾部（失败的关键行），不只说"通过/失败"
- 全绿时明确说"三件套全绿，可提交"
- 有失败时列出失败项、文件路径、关键错误行，给出修复建议方向
- 不要自动修复，只报告（修复由用户决定）

## 范围说明

- 此 skill 只覆盖**自动化**部分（typecheck/lint/test）
- **playwright-cli 功能回归**不在此 skill 范围（需手动跑，见 CLAUDE.md 测试约定）
- **console error 检查**也需手动跑（`playwright-cli -s=<name> console error`）
